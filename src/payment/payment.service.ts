import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { uuidToBuffer } from '../common/helpers/uuid.helper';
import * as crypto from 'crypto';
import * as qs from 'qs';
import { format } from 'date-fns';

@Injectable()
export class PaymentService {
    constructor(private prisma: PrismaService) { }

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
    async createVNPayUrl(orderIdStr: string, ipAddr: string): Promise<string> {
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
            vnp_TxnRef: order.orderCode,
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

    /**
     * Verify VNPay Return
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
            const orderCode = vnp_Params['vnp_TxnRef'];
            const responseCode = vnp_Params['vnp_ResponseCode'];

            const order = await this.prisma.order.findUnique({ where: { orderCode } });
            if (!order) return { code: '99', message: 'Order not found' };

            // Check if payment was successful (00)
            if (responseCode === '00') {
                if (order.paymentStatus !== PaymentStatus.PAID) {
                    await this.prisma.order.update({
                        where: { id: order.id },
                        data: {
                            paymentStatus: PaymentStatus.PAID,
                            paymentTransactionId: vnp_Params['vnp_TransactionNo'],
                            paidAt: new Date()
                        }
                    });
                }
                return { code: '00', message: 'Success', orderCode };
            } else {
                return { code: responseCode, message: 'Payment failed', orderCode };
            }
        } else {
            return { code: '97', message: 'Invalid signature/checksum' };
        }
    }

    /**
     * Create MoMo Payment URL (Requires calling MoMo API to get payUrl)
     */
    async createMoMoUrl(orderIdStr: string): Promise<string> {
        const orderId = uuidToBuffer(orderIdStr);
        const order = await this.prisma.order.findUnique({ where: { id: orderId } });
        if (!order) throw new BadRequestException('Order not found');

        const amount = Number(order.totalAmount).toString();
        const orderInfo = `Thanh toan don hang ${order.orderCode}`;
        const requestId = order.orderCode + '_' + new Date().getTime();
        const redirectUrl = this.momo_ReturnUrl;
        const ipnUrl = 'https://webhook.site/placeholder'; // Placeholder for IPN

        const rawSignature = `accessKey=${this.momo_AccessKey}&amount=${amount}&extraData=&ipnUrl=${ipnUrl}&orderId=${order.orderCode}&orderInfo=${orderInfo}&partnerCode=${this.momo_PartnerCode}&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=captureWallet`;

        const signature = crypto.createHmac('sha256', this.momo_SecretKey).update(rawSignature).digest('hex');

        const requestBody = JSON.stringify({
            partnerCode: this.momo_PartnerCode,
            partnerName: "AlexStore",
            storeId: "MomoTestStore",
            requestId: requestId,
            amount: amount,
            orderId: order.orderCode,
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
     * Verify MoMo Return 
     */
    async verifyMoMoReturn(query: any): Promise<any> {
        const {
            partnerCode, orderId, requestId, amount, orderInfo, orderType,
            transId, resultCode, message, payType, responseTime, extraData, signature
        } = query;

        const rawSignature = `accessKey=${this.momo_AccessKey}&amount=${amount}&extraData=${extraData}&message=${message}&orderId=${orderId}&orderInfo=${orderInfo}&orderType=${orderType}&partnerCode=${partnerCode}&payType=${payType}&requestId=${requestId}&responseTime=${responseTime}&resultCode=${resultCode}&transId=${transId}`;
        const expectedSignature = crypto.createHmac('sha256', this.momo_SecretKey).update(rawSignature).digest('hex');

        if (signature !== expectedSignature) {
            return { code: '97', message: 'Invalid signature/checksum' };
        }

        const order = await this.prisma.order.findUnique({ where: { orderCode: orderId } });
        if (!order) return { code: '99', message: 'Order not found' };

        if (resultCode === '0') {
            if (order.paymentStatus !== PaymentStatus.PAID) {
                await this.prisma.order.update({
                    where: { id: order.id },
                    data: {
                        paymentStatus: PaymentStatus.PAID,
                        paymentTransactionId: transId,
                        paidAt: new Date()
                    }
                });
            }
            return { code: '0', message: 'Success', orderCode: order.orderCode };
        } else {
            return { code: resultCode, message: 'Payment failed' };
        }
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
