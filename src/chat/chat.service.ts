import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { generateUuidV7, uuidToBuffer, bufferToUuid } from '../common/helpers/uuid.helper';
import { MessageType } from '@prisma/client';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get or create a conversation between a buyer and a seller.
   */
  async getOrCreateConversation(buyerIdStr: string, sellerIdStr: string) {
    if (!buyerIdStr || !sellerIdStr) {
      throw new Error('Buyer ID and Seller ID are required');
    }
    const buyerId = uuidToBuffer(buyerIdStr);
    const sellerId = uuidToBuffer(sellerIdStr);

    let conversation = await this.prisma.conversation.findUnique({
      where: { uq_conversation_buyer_seller: { buyerId, sellerId } },
      include: {
        seller: {
          select: {
            id: true,
            username: true,
            sellerProfile: { select: { shopName: true } },
          },
        },
        buyer: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          id: generateUuidV7(),
          buyerId,
          sellerId,
        },
        include: {
          seller: {
            select: {
              id: true,
              username: true,
              sellerProfile: { select: { shopName: true } },
            },
          },
          buyer: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });
    }

    return this.formatConversation(conversation);
  }

  /**
   * Get all conversations for a user (buyer or seller).
   */
  async getConversations(userIdStr: string) {
    if (!userIdStr) {
      throw new Error('User ID is required');
    }
    const userId = uuidToBuffer(userIdStr);

    const conversations = await this.prisma.conversation.findMany({
      where: {
        OR: [{ buyerId: userId }, { sellerId: userId }],
      },
      include: {
        seller: {
          select: {
            id: true,
            username: true,
            sellerProfile: { select: { shopName: true } },
          },
        },
        buyer: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
    });

    return conversations.map((c) => this.formatConversation(c));
  }

  /**
   * Send a message within a conversation, using a Prisma transaction.
   */
  async sendMessage(
    senderIdStr: string,
    conversationIdStr: string,
    content: string,
    type: MessageType = MessageType.TEXT,
    referencedProductIdStr?: string,
    referencedOrderIdStr?: string,
  ) {
    const senderId = uuidToBuffer(senderIdStr);
    const conversationId = uuidToBuffer(conversationIdStr);

    // Verify the sender belongs to this conversation
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const isBuyer = bufferToUuid(conversation.buyerId) === senderIdStr;
    const isSeller = bufferToUuid(conversation.sellerId) === senderIdStr;

    if (!isBuyer && !isSeller) {
      throw new ForbiddenException('You do not belong to this conversation');
    }

    const referencedProductId = referencedProductIdStr
      ? uuidToBuffer(referencedProductIdStr)
      : null;
    const referencedOrderId = referencedOrderIdStr
      ? uuidToBuffer(referencedOrderIdStr)
      : null;

    // Prisma Transaction: create message + update conversation atomically
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          senderId,
          type,
          content,
          referencedProductId,
          referencedOrderId,
        },
        include: {
          sender: {
            select: { id: true, username: true },
          },
          product: {
            select: {
              id: true,
              name: true,
              price: true,
              images: {
                where: { isPrimary: true },
                take: 1,
                select: { imageUrl: true },
              },
            },
          },
          order: {
            select: { id: true, orderCode: true, totalAmount: true, status: true },
          },
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessage: content.substring(0, 500),
          lastMessageAt: new Date(),
          // Increment the unread count for the OTHER party (atomic)
          ...(isBuyer
            ? { unreadCountSeller: { increment: 1 } }
            : { unreadCountBuyer: { increment: 1 } }),
        },
      }),
    ]);

    return this.formatMessage(message);
  }

  /**
   * Get messages for a conversation with cursor-based pagination.
   */
  async getMessages(
    userIdStr: string,
    conversationIdStr: string,
    cursor?: string,
    limit: number = 20,
  ) {
    const userId = uuidToBuffer(userIdStr);
    const conversationId = uuidToBuffer(conversationIdStr);

    // Verify access
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (
      bufferToUuid(conversation.buyerId) !== userIdStr &&
      bufferToUuid(conversation.sellerId) !== userIdStr
    ) {
      throw new ForbiddenException('You do not belong to this conversation');
    }

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor
        ? { skip: 1, cursor: { id: BigInt(cursor) } }
        : {}),
      include: {
        sender: {
          select: { id: true, username: true },
        },
        product: {
          select: {
            id: true,
            name: true,
            price: true,
            images: {
              where: { isPrimary: true },
              take: 1,
              select: { imageUrl: true },
            },
          },
        },
        order: {
          select: { id: true, orderCode: true, totalAmount: true, status: true },
        },
      },
    });

    const hasMore = messages.length === limit;
    const nextCursor = hasMore ? messages[messages.length - 1].id.toString() : null;

    return {
      data: messages.reverse().map((m) => this.formatMessage(m)),
      nextCursor,
      hasMore,
    };
  }

  /**
   * Mark all messages in a conversation as read for a specific user.
   */
  async markAsRead(userIdStr: string, conversationIdStr: string) {
    const conversationId = uuidToBuffer(conversationIdStr);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const isBuyer = bufferToUuid(conversation.buyerId) === userIdStr;
    const isSeller = bufferToUuid(conversation.sellerId) === userIdStr;

    if (!isBuyer && !isSeller) {
      throw new ForbiddenException('You do not belong to this conversation');
    }

    const senderId = isBuyer
      ? conversation.sellerId
      : conversation.buyerId;

    // Transaction: mark messages as read + reset unread count
    await this.prisma.$transaction([
      this.prisma.message.updateMany({
        where: {
          conversationId,
          senderId, // Only mark messages from the OTHER person as read
          isRead: false,
        },
        data: { isRead: true },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: isBuyer
          ? { unreadCountBuyer: 0 }
          : { unreadCountSeller: 0 },
      }),
    ]);

    return { success: true };
  }

  /**
   * Verify that a user belongs to a conversation. Returns the conversation.
   */
  async verifyAccess(userIdStr: string, conversationIdStr: string) {
    const conversationId = uuidToBuffer(conversationIdStr);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) return null;

    const isBuyer = bufferToUuid(conversation.buyerId) === userIdStr;
    const isSeller = bufferToUuid(conversation.sellerId) === userIdStr;

    if (!isBuyer && !isSeller) return null;

    return {
      ...conversation,
      recipientId: isBuyer
        ? bufferToUuid(conversation.sellerId)
        : bufferToUuid(conversation.buyerId),
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private formatConversation(conv: any) {
    return {
      id: bufferToUuid(conv.id),
      buyerId: bufferToUuid(conv.buyerId),
      sellerId: bufferToUuid(conv.sellerId),
      lastMessage: conv.lastMessage,
      lastMessageAt: conv.lastMessageAt,
      unreadCountBuyer: conv.unreadCountBuyer,
      unreadCountSeller: conv.unreadCountSeller,
      createdAt: conv.createdAt,
      buyer: conv.buyer
        ? { id: bufferToUuid(conv.buyer.id), username: conv.buyer.username }
        : undefined,
      seller: conv.seller
        ? {
            id: bufferToUuid(conv.seller.id),
            username: conv.seller.username,
            shopName: conv.seller.sellerProfile?.shopName,
          }
        : undefined,
    };
  }

  private formatMessage(msg: any) {
    return {
      id: msg.id.toString(),
      conversationId: bufferToUuid(msg.conversationId),
      senderId: bufferToUuid(msg.senderId),
      type: msg.type,
      content: msg.content,
      referencedProductId: msg.referencedProductId
        ? bufferToUuid(msg.referencedProductId)
        : null,
      referencedOrderId: msg.referencedOrderId
        ? bufferToUuid(msg.referencedOrderId)
        : null,
      isRead: msg.isRead,
      createdAt: msg.createdAt,
      sender: msg.sender
        ? { id: bufferToUuid(msg.sender.id), username: msg.sender.username }
        : undefined,
      product: msg.product
        ? {
            id: bufferToUuid(msg.product.id),
            name: msg.product.name,
            price: msg.product.price,
            imageUrl: msg.product.images?.[0]?.imageUrl,
          }
        : undefined,
      order: msg.order
        ? {
            id: bufferToUuid(msg.order.id),
            orderCode: msg.order.orderCode,
            totalAmount: msg.order.totalAmount,
            status: msg.order.status,
          }
        : undefined,
    };
  }
}
