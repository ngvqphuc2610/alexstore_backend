import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';
import { OrderStatus, Role, SupportRequestStatus } from '@prisma/client';
import { UsersService } from '../users/users.service';

@Injectable()
export class NotificationsListener {
    private readonly logger = new Logger(NotificationsListener.name);

    constructor(
        private readonly notificationsService: NotificationsService,
        private readonly usersService: UsersService
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

            // Notify Seller
            await this.notificationsService.createNotification(
                payload.sellerIdStr,
                'Đơn hàng mới',
                `Bạn có đơn hàng mới #${payload.orderCode} đang chờ xác nhận!`,
                'NEW_ORDER_FOR_SELLER'
            );
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
            this.logger.log(`Created ORDER_STATUS_UPDATED notification for order ${payload.orderId}`);
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
                }
                this.logger.log(`Created NEW_SELLER_REGISTRATION notifications for user ${payload.userId}`);
            }
        } catch (error) {
            this.logger.error(`Failed to dispatch user.registered notifications: ${error.message}`);
        }
    }
}
