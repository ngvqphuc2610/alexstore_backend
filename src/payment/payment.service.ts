import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { uuidToBuffer, bufferToUuid } from '../common/helpers/uuid.helper';
import * as crypto from 'crypto';
import * as qs from 'qs';
import { format } from 'date-fns';

@Injectable()
export class PaymentService {
    constructor(private prisma: PrismaService) { }
    
    private normalizeOrderCode(code: string): string {
        return code.split('_')[0];
    }

    // =========================================================================
    // =========================================================================
    // VNPAY CONFIGURATION (SANDBOX)
    // =========================================================================
    private get vnp_TmnCode() { return process.env.VNP_TMN_CODE || ''; }
    private get vnp_HashSecret() { return process.env.VNP_HASH_SECRET || ''; }
    private get vnp_Url() { return process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'; }
    private readonly vnp_ReturnUrl = 'http://localhost:3000/checkout/vnpay-return';

    // =========================================================================
    // MOMO CONFIGURATION (SANDBOX)
    // =========================================================================
    private get momo_PartnerCode() { return process.env.MOMO_PARTNER_CODE || ''; }
    private get momo_AccessKey() { return process.env.MOMO_ACCESS_KEY || ''; }
    private get momo_SecretKey() { return process.env.MOMO_SECRET_KEY || ''; }
    private get momo_ApiUrl() { return (process.env.MOMO_ENDPOINT || 'https://test-payment.momo.vn') + '/v2/gateway/api/create'; }
    private readonly momo_ReturnUrl = 'http://localhost:3000/checkout/momo-return';

    /**
     * Create VNPay Payment URL
     */
    async createVNPayUrl(orderIdStr: string, ipAddr: string, customOrderCode?: string): Promise<string> {
        const orderId = uuidToBuffer(orderIdStr);
        const order = await this.prisma.order.findUnique({ where: { id: orderId } });
        if (!order) throw new BadRequestException('Order not found');

        const date = new Date();
        const createDate = format(date, 'yyyyMMddHHmmss');
        const expireDate = format(new Date(date.getTime() + 15 * 60 * 1000), 'yyyyMMddHHmmss');

        // Amount scale: VNPay requires amount * 100
        const amount = Number(order.totalAmount) * 100;

        let vnp_Params: any = {
            vnp_Version: '2.1.0',
            vnp_Command: 'pay',
            vnp_TmnCode: this.vnp_TmnCode,
            vnp_Locale: 'vn',
            vnp_CurrCode: 'VND',
            vnp_TxnRef: customOrderCode || order.orderCode,
            vnp_OrderInfo: `Thanh toan don hang ${order.orderCode}`,
            vnp_OrderType: 'other',
            vnp_Amount: amount,
            vnp_ReturnUrl: this.vnp_ReturnUrl,
            vnp_IpAddr: ipAddr,
            vnp_CreateDate: createDate,
            vnp_ExpireDate: expireDate
        };

        vnp_Params = this.sortObject(vnp_Params);

        const signData = qs.stringify(vnp_Params, { encode: false });
        const hmac = crypto.createHmac('sha512', this.vnp_HashSecret);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
        vnp_Params['vnp_SecureHash'] = signed;

        return this.vnp_Url + '?' + qs.stringify(vnp_Params, { encode: false });
    }

    private async cancelOrderAndRestoreStock(orderId: any) {
        await this.prisma.$transaction(async (tx) => {
            const order = await tx.order.findUnique({ where: { id: orderId } });
            if (!order || order.status !== OrderStatus.PENDING) return;

            const items = await tx.orderItem.findMany({ where: { orderId: orderId } });
            for (const item of items) {
                await tx.product.update({
                    where: { id: item.productId },
                    data: { stockQuantity: { increment: item.quantity } },
                });
            }
            await tx.order.update({
                where: { id: orderId },
                data: { status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.FAILED },
            });
        });
    }

    /**
     * Verify VNPay Return (Frontend display only)
     */
    async verifyVNPayReturn(vnp_Params: any): Promise<any> {
        let secureHash = vnp_Params['vnp_SecureHash'];

        delete vnp_Params['vnp_SecureHash'];
        delete vnp_Params['vnp_SecureHashType'];

        vnp_Params = this.sortObject(vnp_Params);
        const signData = qs.stringify(vnp_Params, { encode: false });
        const hmac = crypto.createHmac('sha512', this.vnp_HashSecret);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

        if (secureHash === signed) {
            const orderCode = this.normalizeOrderCode(vnp_Params['vnp_TxnRef']);
            const responseCode = vnp_Params['vnp_ResponseCode'];

            const order = await this.prisma.order.findUnique({ where: { orderCode } });
            if (!order) return { code: '99', message: 'Order not found' };

            // Fallback for Localhost: Update status directly from Return URL 
            // because IPN/Webhook cannot reach localhost.
            if (responseCode === '00' && order.paymentStatus !== PaymentStatus.PAID) {
                await this.prisma.order.update({
                    where: { id: order.id },
                    data: {
                        paymentStatus: PaymentStatus.PAID,
                        paymentTransactionId: vnp_Params['vnp_TransactionNo'],
                        paidAt: new Date(),
                        status: OrderStatus.PAID
                    }
                });
                return { code: '00', message: 'Success (Updated via Return URL)', orderCode };
            } else if (responseCode === '00') {
                return { code: '00', message: 'Success', orderCode };
            } else {
                // If payment failed explicitly in return params, we could also cancel here
                // but usually better to wait for IPN or let user retry.
                return { code: responseCode, message: 'Payment failed / cancelled', orderCode };
            }
        } else {
            return { code: '97', message: 'Invalid signature/checksum' };
        }
    }

    /**
     * Handle VNPay IPN (Webhook from VNPay Server)
     */
    async handleVNPayIPN(vnp_Params: any): Promise<any> {
        let secureHash = vnp_Params['vnp_SecureHash'];

        delete vnp_Params['vnp_SecureHash'];
        delete vnp_Params['vnp_SecureHashType'];

        vnp_Params = this.sortObject(vnp_Params);
        const signData = qs.stringify(vnp_Params, { encode: false });
        const hmac = crypto.createHmac('sha512', this.vnp_HashSecret);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

        if (secureHash !== signed) {
            return { RspCode: '97', Message: 'Invalid Checksum' };
        }

        const orderCode = this.normalizeOrderCode(vnp_Params['vnp_TxnRef']);
        const responseCode = vnp_Params['vnp_ResponseCode'];
        const amount = vnp_Params['vnp_Amount'];

        const order = await this.prisma.order.findUnique({ where: { orderCode } });
        if (!order) return { RspCode: '01', Message: 'Order Not Found' };

        // Check amount (VNPay amount is * 100)
        if (Number(order.totalAmount) * 100 !== Number(amount)) {
            return { RspCode: '04', Message: 'Invalid amount' };
        }

        if (order.paymentStatus === PaymentStatus.PAID) {
            return { RspCode: '02', Message: 'Order already confirmed' };
        }

        if (responseCode === '00') {
            // If order was already CANCELLED, auto-restore it
            if (order.status === OrderStatus.CANCELLED) {
                await this.prisma.order.update({
                    where: { id: order.id },
                    data: {
                        paymentStatus: PaymentStatus.PAID,
                        paymentTransactionId: vnp_Params['vnp_TransactionNo'],
                        paidAt: new Date(),
                        status: OrderStatus.PAID
                    }
                });
                return { RspCode: '00', Message: 'Confirm Success (Restored)' };
            }

            await this.prisma.order.update({
                where: { id: order.id },
                data: {
                    paymentStatus: PaymentStatus.PAID,
                    paymentTransactionId: vnp_Params['vnp_TransactionNo'],
                    paidAt: new Date(),
                    status: OrderStatus.PAID // Assuming it becomes PAID after successful VNPay payment
                }
            });
            return { RspCode: '00', Message: 'Confirm Success' };
        } else {
            // Payment failed or cancelled by user
            await this.cancelOrderAndRestoreStock(order.id);
            return { RspCode: '00', Message: 'Confirm Success' }; // VNPay requires 00 to acknowledge receipt of webhook
        }
    }

    /**
     * Create MoMo Payment URL (Requires calling MoMo API to get payUrl)
     */
    async createMoMoUrl(orderIdStr: string, customOrderCode?: string): Promise<string> {
        const orderId = uuidToBuffer(orderIdStr);
        const order = await this.prisma.order.findUnique({ where: { id: orderId } });
        if (!order) throw new BadRequestException('Order not found');

        const amount = Number(order.totalAmount).toString();
        const orderInfo = `Thanh toan don hang ${order.orderCode}`;
        const finalOrderCode = customOrderCode || order.orderCode;
        const requestId = finalOrderCode + '_' + new Date().getTime();
        const redirectUrl = this.momo_ReturnUrl;
        const ipnUrl = 'https://webhook.site/placeholder'; // MUST BE REPLACED WITH ACTUAL SERVER URL IN PROD

        const rawSignature = `accessKey=${this.momo_AccessKey}&amount=${amount}&extraData=&ipnUrl=${ipnUrl}&orderId=${finalOrderCode}&orderInfo=${orderInfo}&partnerCode=${this.momo_PartnerCode}&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=captureWallet`;

        const signature = crypto.createHmac('sha256', this.momo_SecretKey).update(rawSignature).digest('hex');

        const requestBody = JSON.stringify({
            partnerCode: this.momo_PartnerCode,
            partnerName: "AlexStore",
            storeId: "MomoTestStore",
            requestId: requestId,
            amount: amount,
            orderId: finalOrderCode,
            orderInfo: orderInfo,
            redirectUrl: redirectUrl,
            ipnUrl: ipnUrl,
            lang: "vi",
            requestType: "captureWallet",
            autoCapture: true,
            extraData: "",
            signature: signature
        });

        // Make HTTP request to MoMo API to get payUrl
        try {
            const fetch = (await import('node-fetch')).default;
            const response = await fetch(this.momo_ApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: requestBody
            });
            const result: any = await response.json();
            if (result.payUrl) {
                return result.payUrl;
            } else {
                throw new Error(result.message || 'MoMo payUrl creation failed');
            }
        } catch (error) {
            console.error('MoMo Error:', error);
            throw new BadRequestException('Could not create MoMo Payment URL');
        }
    }

    /**
     * Verify MoMo Return (Frontend display only)
     */
    async verifyMoMoReturn(query: any): Promise<any> {
        const {
            partnerCode, orderId, requestId, amount, orderInfo, orderType,
            transId, resultCode, message, payType, responseTime, extraData, signature
        } = query;

        const normalizedOrderCode = this.normalizeOrderCode(orderId);
        const rawSignature = `accessKey=${this.momo_AccessKey}&amount=${amount}&extraData=${extraData}&message=${message}&orderId=${orderId}&orderInfo=${orderInfo}&orderType=${orderType}&partnerCode=${partnerCode}&payType=${payType}&requestId=${requestId}&responseTime=${responseTime}&resultCode=${resultCode}&transId=${transId}`;
        const expectedSignature = crypto.createHmac('sha256', this.momo_SecretKey).update(rawSignature).digest('hex');

        if (signature !== expectedSignature) {
            return { code: '97', message: 'Invalid signature/checksum' };
        }

        const order = await this.prisma.order.findUnique({ where: { orderCode: normalizedOrderCode } });
        if (!order) return { code: '99', message: 'Order not found' };

        if (resultCode === '0' && order.paymentStatus !== PaymentStatus.PAID) {
            // Fallback for Localhost/Dev: Update status directly from Return URL
            await this.prisma.order.update({
                where: { id: order.id },
                data: {
                    paymentStatus: PaymentStatus.PAID,
                    paymentTransactionId: String(transId),
                    paidAt: new Date(),
                    status: OrderStatus.PAID
                }
            });
            return { code: '0', message: 'Success (Updated via Return URL)', orderCode: order.orderCode };
        } else if (resultCode === '0') {
            return { code: '0', message: 'Success', orderCode: order.orderCode };
        } else {
            return { code: resultCode, message: 'Payment failed' };
        }
    }

    /**
     * Handle MoMo IPN (Webhook from MoMo Server)
     */
    async handleMoMoIPN(body: any): Promise<any> {
        const {
            partnerCode, orderId, requestId, amount, orderInfo, orderType,
            transId, resultCode, message, payType, responseTime, extraData, signature
        } = body;

        const normalizedOrderCode = this.normalizeOrderCode(orderId);
        const rawSignature = `accessKey=${this.momo_AccessKey}&amount=${amount}&extraData=${extraData || ""}&message=${message}&orderId=${orderId}&orderInfo=${orderInfo}&orderType=${orderType}&partnerCode=${partnerCode}&payType=${payType}&requestId=${requestId}&responseTime=${responseTime}&resultCode=${resultCode}&transId=${transId}`;
        const expectedSignature = crypto.createHmac('sha256', this.momo_SecretKey).update(rawSignature).digest('hex');

        if (signature !== expectedSignature) {
            throw new BadRequestException('Invalid signature');
        }

        const order = await this.prisma.order.findUnique({ where: { orderCode: normalizedOrderCode } });
        if (!order) throw new BadRequestException('Order not found');

        if (order.paymentStatus === PaymentStatus.PAID) {
            return { message: 'Order already paid' };
        }

        if (resultCode === 0) { // Success
            // If order was already CANCELLED, we should probably auto-restore it or flag it
            if (order.status === OrderStatus.CANCELLED) {
                // Auto-restore strategy
                await this.prisma.order.update({
                    where: { id: order.id },
                    data: {
                        paymentStatus: PaymentStatus.PAID,
                        paymentTransactionId: String(transId),
                        paidAt: new Date(),
                        status: OrderStatus.PAID // Restore to PAID
                    }
                });
                return { message: 'Success (Restored from Cancelled)' };
            }

            await this.prisma.order.update({
                where: { id: order.id },
                data: {
                    paymentStatus: PaymentStatus.PAID,
                    paymentTransactionId: String(transId),
                    paidAt: new Date(),
                    status: OrderStatus.PAID
                }
            });
            return { message: 'Success' };
        } else {
            // Failed
            await this.cancelOrderAndRestoreStock(order.id);
            return { message: 'Failed and restored stock' };
        }
    }

    /**
     * Repay an existing order
     */
    async repay(orderIdStr: string, ipAddr: string): Promise<{ url: string }> {
        const orderId = uuidToBuffer(orderIdStr);
        const order = await this.prisma.order.findUnique({ where: { id: orderId } });

        if (!order) throw new BadRequestException('Order not found');
        if (order.status !== OrderStatus.PENDING) {
            throw new BadRequestException(`Cannot repay order in ${order.status} status`);
        }

        // Simple rate limiting: Don't allow repaying if updated less than 5s ago
        const now = new Date();
        const diff = now.getTime() - new Date(order.updatedAt).getTime();
        if (diff < 5000) {
            throw new BadRequestException('Please wait 5 seconds before trying again');
        }

        // Create versioned order code to avoid duplicates in VNPay/MoMo
        const versionedOrderCode = `${order.orderCode}_${now.getTime()}`;

        if (order.paymentMethod === 'VNPAY') {
            const url = await this.createVNPayUrl(orderIdStr, ipAddr, versionedOrderCode);
            return { url };
        } else if (order.paymentMethod === 'MOMO') {
            const url = await this.createMoMoUrl(orderIdStr, versionedOrderCode);
            return { url };
        }

        throw new BadRequestException('Repayment not supported for this payment method');
    }

    // Helper for VNPay
    private sortObject(obj: any): any {
        let sorted = {};
        let str: string[] = [];
        let key;
        for (key in obj) {
            if (obj.hasOwnProperty(key)) {
                str.push(encodeURIComponent(key));
            }
        }
        str.sort();
        for (key = 0; key < str.length; key++) {
            sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, '+');
        }
        return sorted;
    }
}
