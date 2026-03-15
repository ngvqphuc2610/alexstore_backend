import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';
import { OrderStatus, Role, SupportRequestStatus } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsListener {
    private readonly logger = new Logger(NotificationsListener.name);

    constructor(
        private readonly notificationsService: NotificationsService,
        private readonly usersService: UsersService,
        private readonly mailService: MailService,
        private readonly notificationsGateway: NotificationsGateway
    ) { }

    @OnEvent('order.created')
    async handleOrderCreatedEvent(payload: {
        orderId: string,
        orderCode: string,
        buyerIdStr: string,
        sellerIdStr: string
    }) {
        try {
            // Notify Buyer
            await this.notificationsService.createNotification(
                payload.buyerIdStr,
                'Đơn hàng thiết lập thành công',
                `Đơn hàng #${payload.orderCode} của bạn đã được đặt thành công và đang chờ người bán xác nhận.`,
                'ORDER_CREATED'
            );
            this.notificationsGateway.sendToUser(payload.buyerIdStr, {
                title: 'Đơn hàng thiết lập thành công',
                message: `Đơn hàng #${payload.orderCode} của bạn đã được đặt thành công và đang chờ người bán xác nhận.`,
                type: 'ORDER_CREATED'
            });

            // Fetch Buyer Email
            const buyer = await this.usersService.getUserForEmail(payload.buyerIdStr);
            if (buyer && buyer.email && buyer.notificationSettings?.emailOrderUpdates !== false) {
                await this.mailService.sendMail({
                    to: buyer.email,
                    subject: 'Xác nhận đơn hàng mới từ AlexStore',
                    template: 'order-confirmation',
                    context: {
                        name: buyer.username,
                        orderCode: payload.orderCode,
                        title: 'Xác nhận đơn hàng'
                    }
                });
            }

            // Notify Seller
            await this.notificationsService.createNotification(
                payload.sellerIdStr,
                'Đơn hàng mới',
                `Bạn có đơn hàng mới #${payload.orderCode} đang chờ xác nhận!`,
                'NEW_ORDER_FOR_SELLER'
            );
            this.notificationsGateway.sendToUser(payload.sellerIdStr, {
                title: 'Đơn hàng mới',
                message: `Bạn có đơn hàng mới #${payload.orderCode} đang chờ xác nhận!`,
                type: 'NEW_ORDER_FOR_SELLER'
            });
            this.logger.log(`Created ORDER_CREATED notifications for order ${payload.orderId}`);
        } catch (error) {
            this.logger.error(`Failed to dispatch order.created notifications: ${error.message}`);
        }
    }

    @OnEvent('order.status_updated')
    async handleOrderStatusUpdatedEvent(payload: {
        orderId: string,
        orderCode: string,
        buyerIdStr: string,
        newStatus: OrderStatus
    }) {
        try {
            const statusMap: Record<OrderStatus, string> = {
                PENDING: 'Đang chờ xử lý',
                PAID: 'Đã thanh toán',
                SHIPPING: 'Đang giao hàng',
                DELIVERED: 'Đã giao thành công',
                CANCELLED: 'Đã bị hủy',
            };

            const statusText = statusMap[payload.newStatus] || payload.newStatus;

            // Notify Buyer
            await this.notificationsService.createNotification(
                payload.buyerIdStr,
                'Cập nhật trạng thái đơn hàng',
                `Đơn hàng #${payload.orderCode} của bạn đã chuyển sang trạng thái: ${statusText}.`,
                'ORDER_STATUS_UPDATED'
            );
            this.notificationsGateway.sendToUser(payload.buyerIdStr, {
                title: 'Cập nhật trạng thái đơn hàng',
                message: `Đơn hàng #${payload.orderCode} của bạn đã chuyển sang trạng thái: ${statusText}.`,
                type: 'ORDER_STATUS_UPDATED'
            });
            this.logger.log(`Created ORDER_STATUS_UPDATED notification for order ${payload.orderId}`);

            // Fetch Buyer Email
            const buyer = await this.usersService.getUserForEmail(payload.buyerIdStr);
            if (buyer && buyer.email && buyer.notificationSettings?.emailOrderUpdates !== false) {
                await this.mailService.sendMail({
                    to: buyer.email,
                    subject: `Cập nhật đơn hàng: ${statusText}`,
                    template: 'order-status',
                    context: {
                        name: buyer.username,
                        orderCode: payload.orderCode,
                        status: statusText,
                        title: 'Trạng thái đơn hàng'
                    }
                });
            }
        } catch (error) {
            this.logger.error(`Failed to dispatch order.status_updated notifications: ${error.message}`);
        }
    }

    @OnEvent('product.low_stock')
    async handleProductLowStock(payload: {
        productId: string,
        productName: string,
        sellerIdStr: string,
        stock: number
    }) {
        try {
            await this.notificationsService.createNotification(
                payload.sellerIdStr,
                'Sản phẩm sắp hết hàng',
                `Sản phẩm "${payload.productName}" sắp hết hàng (chỉ còn ${payload.stock} sản phẩm).`,
                'LOW_STOCK_ALERT'
            );
            this.notificationsGateway.sendToUser(payload.sellerIdStr, {
                title: 'Sản phẩm sắp hết hàng',
                message: `Sản phẩm "${payload.productName}" sắp hết hàng (chỉ còn ${payload.stock} sản phẩm).`,
                type: 'LOW_STOCK_ALERT'
            });
            this.logger.log(`Created LOW_STOCK_ALERT notification for product ${payload.productId}`);
        } catch (error) {
            this.logger.error(`Failed to dispatch product.low_stock notifications: ${error.message}`);
        }
    }

    @OnEvent('product.approved')
    async handleProductApproved(payload: {
        productId: string,
        productName: string,
        sellerIdStr: string
    }) {
        try {
            await this.notificationsService.createNotification(
                payload.sellerIdStr,
                'Sản phẩm đã được duyệt',
                `Sản phẩm "${payload.productName}" của bạn đã được Admin phê duyệt và cập nhật hiển thị.`,
                'PRODUCT_APPROVED'
            );
            this.notificationsGateway.sendToUser(payload.sellerIdStr, {
                title: 'Sản phẩm đã được duyệt',
                message: `Sản phẩm "${payload.productName}" của bạn đã được Admin phê duyệt và cập nhật hiển thị.`,
                type: 'PRODUCT_APPROVED'
            });
            const user = await this.usersService.getUserForEmail(payload.sellerIdStr);
            if (user && user.email) {
                await this.mailService.sendMail({
                    to: user.email,
                    subject: 'Thông báo: Sản phẩm đã được duyệt',
                    template: 'product-approved',
                    context: {
                        sellerName: user.username,
                        productName: payload.productName,
                        productUrl: `http://localhost:3000/products/${payload.productId}`
                    }
                });
            }
            this.logger.log(`Created PRODUCT_APPROVED notification for product ${payload.productId}`);
        } catch (error) {
            this.logger.error(`Failed to dispatch product.approved notifications: ${error.message}`);
        }
    }

    @OnEvent('product.rejected')
    async handleProductRejected(payload: {
        productId: string,
        productName: string,
        sellerIdStr: string
    }) {
        try {
            await this.notificationsService.createNotification(
                payload.sellerIdStr,
                'Sản phẩm bị từ chối',
                `Sản phẩm "${payload.productName}" của bạn không đạt yêu cầu và đã bị từ chối. Vui lòng kiểm tra lại nội dung.`,
                'PRODUCT_REJECTED'
            );
            this.notificationsGateway.sendToUser(payload.sellerIdStr, {
                title: 'Sản phẩm bị từ chối',
                message: `Sản phẩm "${payload.productName}" của bạn không đạt yêu cầu và đã bị từ chối. Vui lòng kiểm tra lại nội dung.`,
                type: 'PRODUCT_REJECTED'
            });
            const user = await this.usersService.getUserForEmail(payload.sellerIdStr);
            if (user && user.email) {
                await this.mailService.sendMail({
                    to: user.email,
                    subject: 'Thông báo: Sản phẩm bị từ chối',
                    template: 'product-rejected',
                    context: {
                        sellerName: user.username,
                        productName: payload.productName,
                        reason: 'Sản phẩm không tuân thủ chính sách của sàn.'
                    }
                });
            }
            this.logger.log(`Created PRODUCT_REJECTED notification for product ${payload.productId}`);
        } catch (error) {
            this.logger.error(`Failed to dispatch product.rejected notifications: ${error.message}`);
        }
    }

    @OnEvent('product.created')
    async handleProductCreated(payload: {
        productId: string,
        productName: string,
        sellerIdStr: string
    }) {
        try {
            const adminIds = await this.usersService.findAllAdmins();
            for (const adminId of adminIds) {
                await this.notificationsService.createNotification(
                    adminId,
                    'Sản phẩm mới cần duyệt',
                    `Sản phẩm "${payload.productName}" vừa được tạo và đang chờ phê duyệt.`,
                    'PRODUCT_PENDING_APPROVAL'
                );
                this.notificationsGateway.sendToAdmins({
                    title: 'Sản phẩm mới cần duyệt',
                    message: `Sản phẩm "${payload.productName}" vừa được tạo và đang chờ phê duyệt.`,
                    type: 'PRODUCT_PENDING_APPROVAL'
                });
            }
            this.logger.log(`Created PRODUCT_PENDING_APPROVAL notifications for product ${payload.productId}`);
        } catch (error) {
            this.logger.error(`Failed to dispatch product.created notifications: ${error.message}`);
        }
    }

    @OnEvent('support.created')
    async handleSupportCreated(payload: {
        requestId: number,
        title: string,
        userId: string
    }) {
        try {
            const adminIds = await this.usersService.findAllAdmins();
            for (const adminId of adminIds) {
                await this.notificationsService.createNotification(
                    adminId,
                    'Yêu cầu hỗ trợ mới',
                    `Bạn có một yêu cầu hỗ trợ mới: "${payload.title}".`,
                    'NEW_SUPPORT_TICKET'
                );

                this.notificationsGateway.sendToAdmins({
                    title: 'Yêu cầu hỗ trợ mới',
                    message: `Bạn có một yêu cầu hỗ trợ mới: "${payload.title}".`,
                    type: 'NEW_SUPPORT_TICKET'
                });

                // Fetch Admin Email
                const admin = await this.usersService.getUserForEmail(adminId);
                if (admin && admin.email) {
                    await this.mailService.sendMail({
                        to: admin.email,
                        subject: 'AlexStore: Yêu cầu hỗ trợ mới',
                        template: 'admin-support-ticket',
                        context: {
                            ticketTitle: payload.title,
                        }
                    });
                }
            }
            this.logger.log(`Created NEW_SUPPORT_TICKET notifications for ticket ${payload.requestId}`);
        } catch (error) {
            this.logger.error(`Failed to dispatch support.created notifications: ${error.message}`);
        }
    }

    @OnEvent('support.replied')
    async handleSupportReplied(payload: {
        requestId: number,
        userId: string,
        status: SupportRequestStatus
    }) {
        try {
            const statusText = payload.status === SupportRequestStatus.RESOLVED ? 'đã được giải quyết' : 'đã có phản hồi mới';
            await this.notificationsService.createNotification(
                payload.userId,
                'Cập nhật yêu cầu hỗ trợ',
                `Yêu cầu hỗ trợ #${payload.requestId} của bạn ${statusText}.`,
                'SUPPORT_TICKET_UPDATED'
            );
            this.notificationsGateway.sendToUser(payload.userId, {
                title: 'Cập nhật yêu cầu hỗ trợ',
                message: `Yêu cầu hỗ trợ #${payload.requestId} của bạn ${statusText}.`,
                type: 'SUPPORT_TICKET_UPDATED'
            });
            this.logger.log(`Created SUPPORT_TICKET_UPDATED notification for user ${payload.userId}`);
        } catch (error) {
            this.logger.error(`Failed to dispatch support.replied notifications: ${error.message}`);
        }
    }

    @OnEvent('user.registered')
    async handleUserRegistered(payload: {
        userId: string,
        username: string,
        role: Role
    }) {
        try {
            if (payload.role === Role.SELLER) {
                const adminIds = await this.usersService.findAllAdmins();
                for (const adminId of adminIds) {
                    await this.notificationsService.createNotification(
                        adminId,
                        'Người bán mới đăng ký',
                        `Tài khoản người bán "${payload.username}" vừa được tạo thành công.`,
                        'NEW_SELLER_REGISTRATION'
                    );

                    // Fetch Admin Email
                    const admin = await this.usersService.getUserForEmail(adminId);
                    if (admin && admin.email) {
                        await this.mailService.sendMail({
                            to: admin.email,
                            subject: 'AlexStore: Người bán mới đăng ký',
                            template: 'admin-new-seller',
                            context: {
                                sellerName: payload.username,
                            }
                        });
                    }
                }
                
                this.notificationsGateway.sendToAdmins({
                    title: 'Người bán mới đăng ký',
                    message: `Tài khoản người bán "${payload.username}" vừa được tạo thành công.`,
                    type: 'NEW_SELLER_REGISTRATION'
                });

                this.logger.log(`Created NEW_SELLER_REGISTRATION notifications for user ${payload.userId}`);
            }
        } catch (error) {
            this.logger.error(`Failed to dispatch user.registered notifications: ${error.message}`);
        }
    }

    @OnEvent('seller.requested')
    async handleSellerRequested(payload: {
        userId: string,
        shopName: string
    }) {
        try {
            const adminIds = await this.usersService.findAllAdmins();
            for (const adminId of adminIds) {
                await this.notificationsService.createNotification(
                    adminId,
                    'Yêu cầu mở Shop mới',
                    `Người dùng vừa gửi yêu cầu mở Shop: "${payload.shopName}".`,
                    'SELLER_REQUEST_PENDING'
                );

                const admin = await this.usersService.getUserForEmail(adminId);
                if (admin && admin.email) {
                    await this.mailService.sendMail({
                        to: admin.email,
                        subject: 'AlexStore: Yêu cầu mở Shop mới',
                        template: 'admin-new-seller',
                        context: {
                            sellerName: payload.shopName,
                        }
                    });
                }
            }

            this.notificationsGateway.sendToAdmins({
                title: 'Yêu cầu mở Shop mới',
                message: `Người dùng vừa gửi yêu cầu mở Shop: "${payload.shopName}".`,
                type: 'SELLER_REQUEST_PENDING'
            });

            this.logger.log(`Created SELLER_REQUEST_PENDING notifications for shop ${payload.shopName}`);
        } catch (error) {
            this.logger.error(`Failed to dispatch seller.requested notifications: ${error.message}`);
        }
    }

    @OnEvent('seller.approved')
    async handleSellerApproved(payload: {
        userId: string,
        shopName: string,
        username: string
    }) {
        try {
            await this.notificationsService.createNotification(
                payload.userId,
                'Chúc mừng! Cửa hàng đã được duyệt',
                `Yêu cầu mở cửa hàng "${payload.shopName}" của bạn đã được Admin phê duyệt.`,
                'SELLER_APPROVED'
            );
            this.notificationsGateway.sendToUser(payload.userId, {
                title: 'Chúc mừng! Cửa hàng đã được duyệt',
                message: `Yêu cầu mở cửa hàng "${payload.shopName}" của bạn đã được Admin phê duyệt.`,
                type: 'SELLER_APPROVED'
            });

            const user = await this.usersService.getUserForEmail(payload.userId);
            if (user && user.email) {
                await this.mailService.sendMail({
                    to: user.email,
                    subject: 'Chúc mừng! Cửa hàng của bạn đã được duyệt',
                    template: 'seller-approved',
                    context: {
                        sellerName: payload.username,
                        shopName: payload.shopName,
                        dashboardUrl: 'http://localhost:3000/seller' // Update with real URL if needed
                    }
                });
            }
        } catch (error) {
            this.logger.error(`Failed to dispatch seller.approved notifications: ${error.message}`);
        }
    }

    @OnEvent('seller.rejected')
    async handleSellerRejected(payload: {
        userId: string,
        shopName: string,
        username: string,
        reason?: string
    }) {
        try {
            await this.notificationsService.createNotification(
                payload.userId,
                'Yêu cầu mở Shop bị từ chối',
                `Yêu cầu mở cửa hàng "${payload.shopName}" của bạn đã bị từ chối.`,
                'SELLER_REJECTED'
            );
            this.notificationsGateway.sendToUser(payload.userId, {
                title: 'Yêu cầu mở Shop bị từ chối',
                message: `Yêu cầu mở cửa hàng "${payload.shopName}" của bạn đã bị từ chối.`,
                type: 'SELLER_REJECTED'
            });

            const user = await this.usersService.getUserForEmail(payload.userId);
            if (user && user.email) {
                await this.mailService.sendMail({
                    to: user.email,
                    subject: 'Thông báo kết quả đăng ký người bán',
                    template: 'seller-rejected',
                    context: {
                        sellerName: payload.username,
                        shopName: payload.shopName,
                        reason: payload.reason || 'Thông tin chưa đầy đủ hoặc không hợp lệ.'
                    }
                });
            }
        } catch (error) {
            this.logger.error(`Failed to dispatch seller.rejected notifications: ${error.message}`);
        }
    }
}
