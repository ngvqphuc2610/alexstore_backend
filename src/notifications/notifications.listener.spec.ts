import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsListener } from './notifications.listener';
import { NotificationsService } from './notifications.service';
import { UsersService } from '../users/users.service';
import { OrderStatus, Role, SupportRequestStatus } from '@prisma/client';
import { NotificationsGateway } from './notifications.gateway';

// Mock the problematic mail service that imports uuid
jest.mock('../mail/mail.service', () => ({
    MailService: jest.fn().mockImplementation(() => ({
        sendMail: jest.fn().mockResolvedValue({ success: true }),
    })),
}));

import { MailService } from '../mail/mail.service';

describe('NotificationsListener', () => {
    let listener: NotificationsListener;
    let mockNotificationsService: jest.Mocked<Partial<NotificationsService>>;
    let mockUsersService: jest.Mocked<Partial<UsersService>>;
    let mockMailService: jest.Mocked<Partial<MailService>>;
    let mockNotificationsGateway: jest.Mocked<Partial<NotificationsGateway>>;

    beforeEach(async () => {
        mockNotificationsService = {
            createNotification: jest.fn(),
        };
        mockUsersService = {
            findAllAdmins: jest.fn().mockResolvedValue(['admin-uuid-1', 'admin-uuid-2']),
            getUserForEmail: jest.fn().mockResolvedValue({ email: 'test@example.com', username: 'testuser' }),
        };
        mockMailService = {
            sendMail: jest.fn().mockResolvedValue({ success: true }),
        };
        mockNotificationsGateway = {
            sendToUser: jest.fn(),
            sendToAdmins: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                NotificationsListener,
                {
                    provide: NotificationsService,
                    useValue: mockNotificationsService,
                },
                {
                    provide: UsersService,
                    useValue: mockUsersService,
                },
                {
                    provide: NotificationsGateway,
                    useValue: mockNotificationsGateway,
                },
                MailService, // Use the mocked class
            ],
        }).compile();

        listener = module.get<NotificationsListener>(NotificationsListener);
        mockMailService = module.get(MailService);
    });

    it('should be defined', () => {
        expect(listener).toBeDefined();
    });

    it('should handle order.created event', async () => {
        const payload = {
            orderId: 'uuid-123',
            orderCode: 'ORD-123',
            buyerIdStr: 'buyer-uuid',
            sellerIdStr: 'seller-uuid',
        };

        await listener.handleOrderCreatedEvent(payload);

        expect(mockNotificationsService.createNotification).toHaveBeenCalledTimes(2);
        expect(mockNotificationsService.createNotification).toHaveBeenNthCalledWith(
            1,
            'buyer-uuid',
            'Đơn hàng thiết lập thành công',
            expect.stringContaining('ORD-123'),
            'ORDER_CREATED'
        );
        expect(mockNotificationsService.createNotification).toHaveBeenNthCalledWith(
            2,
            'seller-uuid',
            'Đơn hàng mới',
            expect.stringContaining('ORD-123'),
            'NEW_ORDER_FOR_SELLER'
        );
    });

    it('should handle product.created event (notify admins)', async () => {
        const payload = {
            productId: 'PROD-123',
            productName: 'Iphone 15',
            sellerIdStr: 'seller-uuid',
        };

        await listener.handleProductCreated(payload);

        expect(mockUsersService.findAllAdmins).toHaveBeenCalled();
        expect(mockNotificationsService.createNotification).toHaveBeenCalledTimes(2); // 2 admins
        expect(mockNotificationsService.createNotification).toHaveBeenCalledWith(
            'admin-uuid-1',
            'Sản phẩm mới cần duyệt',
            expect.stringContaining('Iphone 15'),
            'PRODUCT_PENDING_APPROVAL'
        );
    });

    it('should handle support.created event (notify admins)', async () => {
        const payload = {
            requestId: 123,
            title: 'Lỗi thanh toán',
            userId: 'user-uuid',
        };

        await listener.handleSupportCreated(payload);

        expect(mockUsersService.findAllAdmins).toHaveBeenCalled();
        expect(mockNotificationsService.createNotification).toHaveBeenCalledTimes(2);
        expect(mockNotificationsService.createNotification).toHaveBeenCalledWith(
            'admin-uuid-2',
            'Yêu cầu hỗ trợ mới',
            expect.stringContaining('Lỗi thanh toán'),
            'NEW_SUPPORT_TICKET'
        );
    });

    it('should handle support.replied event (notify user)', async () => {
        const payload = {
            requestId: 123,
            userId: 'user-uuid',
            status: SupportRequestStatus.RESOLVED,
        };

        await listener.handleSupportReplied(payload);

        expect(mockNotificationsService.createNotification).toHaveBeenCalledWith(
            'user-uuid',
            'Cập nhật yêu cầu hỗ trợ',
            expect.stringContaining('đã được giải quyết'),
            'SUPPORT_TICKET_UPDATED'
        );
    });

    it('should handle user.registered event for seller (notify admins)', async () => {
        const payload = {
            userId: 'new-seller-uuid',
            username: 'CoolSeller',
            role: Role.SELLER,
        };

        await listener.handleUserRegistered(payload);

        expect(mockUsersService.findAllAdmins).toHaveBeenCalled();
        expect(mockNotificationsService.createNotification).toHaveBeenCalledTimes(2);
        expect(mockNotificationsService.createNotification).toHaveBeenCalledWith(
            'admin-uuid-1',
            'Người bán mới đăng ký',
            expect.stringContaining('CoolSeller'),
            'NEW_SELLER_REGISTRATION'
        );
        expect(mockMailService.sendMail).toHaveBeenCalled();
    });

    it('should handle seller.requested event', async () => {
        const payload = { userId: 'user-123', shopName: 'MyBrand' };
        await listener.handleSellerRequested(payload);
        expect(mockNotificationsService.createNotification).toHaveBeenCalledWith(
            'admin-uuid-1',
            'Yêu cầu mở Shop mới',
            expect.stringContaining('MyBrand'),
            'SELLER_REQUEST_PENDING'
        );
        expect(mockMailService.sendMail).toHaveBeenCalledWith(expect.objectContaining({
            template: 'admin-new-seller'
        }));
    });

    it('should handle seller.approved event', async () => {
        const payload = { userId: 'user-123', shopName: 'MyBrand', username: 'seller1' };
        await listener.handleSellerApproved(payload);
        expect(mockNotificationsService.createNotification).toHaveBeenCalledWith(
            'user-123',
            expect.stringContaining('được duyệt'),
            expect.any(String),
            'SELLER_APPROVED'
        );
        expect(mockMailService.sendMail).toHaveBeenCalledWith(expect.objectContaining({
            template: 'seller-approved'
        }));
    });

    it('should handle seller.rejected event', async () => {
        const payload = { userId: 'user-123', shopName: 'MyBrand', username: 'seller1', reason: 'Invalid info' };
        await listener.handleSellerRejected(payload);
        expect(mockNotificationsService.createNotification).toHaveBeenCalledWith(
            'user-123',
            expect.stringContaining('bị từ chối'),
            expect.any(String),
            'SELLER_REJECTED'
        );
        expect(mockMailService.sendMail).toHaveBeenCalledWith(expect.objectContaining({
            template: 'seller-rejected'
        }));
    });
});
