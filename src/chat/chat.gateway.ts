import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { MessageType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: 'chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  // Track online users: userId -> Set of socket IDs
  private onlineUsers = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);

      if (!token) {
        this.logger.warn(`Chat client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token);
      const userId = payload.sub;
      client.data.userId = userId;
      client.join(`user_${userId}`);

      // Track online status
      if (!this.onlineUsers.has(userId)) {
        this.onlineUsers.set(userId, new Set());
      }
      this.onlineUsers.get(userId)!.add(client.id);

      this.logger.log(`Chat: User ${userId} connected (socket: ${client.id})`);
    } catch (error) {
      this.logger.error(`Chat auth failed for ${client.id}: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if (userId) {
      const sockets = this.onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.onlineUsers.delete(userId);
        }
      }
    }
    this.logger.log(`Chat: Client disconnected: ${client.id}`);
  }

  /**
   * Join a conversation room (with authorization)
   */
  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data?.userId;
    if (!userId) return { event: 'error', data: 'Not authenticated' };

    const access = await this.chatService.verifyAccess(userId, data.conversationId);
    if (!access) {
      return { event: 'error', data: 'Access denied to this conversation' };
    }

    const roomName = `chat_${data.conversationId}`;
    client.join(roomName);
    this.logger.log(`User ${userId} joined room ${roomName}`);

    return { event: 'joined_room', data: { conversationId: data.conversationId } };
  }

  /**
   * Send a message
   */
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      conversationId: string;
      content: string;
      type?: MessageType;
      referencedProductId?: string;
      referencedOrderId?: string;
    },
  ) {
    const userId = client.data?.userId;
    if (!userId) return { event: 'error', data: 'Not authenticated' };

    try {
      const message = await this.chatService.sendMessage(
        userId,
        data.conversationId,
        data.content,
        data.type || MessageType.TEXT,
        data.referencedProductId,
        data.referencedOrderId,
      );

      // Broadcast to all clients in the room
      const roomName = `chat_${data.conversationId}`;
      this.server.to(roomName).emit('receive_message', message);

      // Also notify recipient via their personal room (for unread badge updates)
      const access = await this.chatService.verifyAccess(userId, data.conversationId);
      if (access) {
        const recipientId = access.recipientId;
        this.server.to(`user_${recipientId}`).emit('new_chat_message', {
          conversationId: data.conversationId,
          message,
        });

        // Offline Fallback: Create a persistent notification if recipient is not online in chat
        if (!this.isUserOnline(recipientId)) {
          const senderName = message.sender?.username || 'Một người dùng';
          await this.notificationsService.createNotification(
            recipientId,
            'Tin nhắn mới',
            `Bạn có tin nhắn mới từ ${senderName}: "${data.content.substring(0, 50)}${data.content.length > 50 ? '...' : ''}"`,
            'CHAT',
          );
        }
      }

      return { event: 'message_sent', data: message };
    } catch (error) {
      this.logger.error(`Send message failed: ${error.message}`);
      return { event: 'error', data: error.message };
    }
  }

  /**
   * Typing indicator
   */
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data?.userId;
    if (!userId) return;

    const roomName = `chat_${data.conversationId}`;
    client.to(roomName).emit('typing', { userId, conversationId: data.conversationId });
  }

  @SubscribeMessage('stop_typing')
  async handleStopTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data?.userId;
    if (!userId) return;

    const roomName = `chat_${data.conversationId}`;
    client.to(roomName).emit('stop_typing', { userId, conversationId: data.conversationId });
  }

  /**
   * Mark messages as read
   */
  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data?.userId;
    if (!userId) return { event: 'error', data: 'Not authenticated' };

    try {
      await this.chatService.markAsRead(userId, data.conversationId);

      // Notify the other person that messages were read
      const roomName = `chat_${data.conversationId}`;
      client.to(roomName).emit('messages_read', {
        conversationId: data.conversationId,
        readBy: userId,
      });

      return { event: 'read_confirmed', data: { conversationId: data.conversationId } };
    } catch (error) {
      return { event: 'error', data: error.message };
    }
  }

  /**
   * Check online status
   */
  @SubscribeMessage('check_online')
  handleCheckOnline(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string },
  ) {
    const isOnline = this.onlineUsers.has(data.userId);
    return { event: 'user_status', data: { userId: data.userId, isOnline } };
  }

  /**
   * Check if a user has active socket connections
   */
  isUserOnline(userId: string): boolean {
    return this.onlineUsers.has(userId) && this.onlineUsers.get(userId)!.size > 0;
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private extractToken(client: Socket): string | null {
    let token =
      client.handshake.auth.token ||
      client.handshake.headers.authorization?.split(' ')[1];

    if (!token && client.handshake.headers.cookie) {
      const cookies = client.handshake.headers.cookie.split(';');
      const tokenCookie = cookies.find((c) =>
        c.trim().startsWith('alexstore_token='),
      );
      if (tokenCookie) {
        token = tokenCookie.split('=')[1];
      }
    }

    return token || null;
  }
}
