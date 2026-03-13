import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { uuidToBuffer } from '../common/helpers/uuid.helper';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async getUserNotifications(userIdStr: string, limit: number = 20) {
    const userId = uuidToBuffer(userIdStr);
    
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const unreadCount = await this.prisma.notification.count({
      where: { userId, isRead: false }
    });

    return {
      data: notifications.map(n => ({
        id: Number(n.id),
        title: n.title,
        message: n.message,
        type: n.type,
        isRead: n.isRead,
        createdAt: n.createdAt
      })),
      unreadCount
    };
  }

  async markAsRead(userIdStr: string, notificationId: number) {
    const userId = uuidToBuffer(userIdStr);

    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId }
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true }
    });

    return { id: Number(updated.id), isRead: updated.isRead };
  }

  async markAllAsRead(userIdStr: string) {
    const userId = uuidToBuffer(userIdStr);

    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true }
    });

    return { message: 'All notifications marked as read' };
  }

  // Internal method to create notifications (e.g. from Order service)
  async createNotification(userIdStr: string, title: string, message: string, type: string = 'SYSTEM') {
    const userId = uuidToBuffer(userIdStr);
    
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type
      }
    });

    return { id: Number(notification.id) };
  }
}
