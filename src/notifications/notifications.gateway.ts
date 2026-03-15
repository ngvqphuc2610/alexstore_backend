import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: 'notifications',
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      let token = client.handshake.auth.token || client.handshake.headers.authorization?.split(' ')[1];

      // fallback to cookie if not in auth or headers
      if (!token && client.handshake.headers.cookie) {
        const cookies = client.handshake.headers.cookie.split(';');
        const tokenCookie = cookies.find(c => c.trim().startsWith('alexstore_token='));
        if (tokenCookie) {
          token = tokenCookie.split('=')[1];
        }
      }

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token);
      const userId = payload.sub;
      client.join(`user_${userId}`);
      
      // If admin, join admin room
      if (payload.role === 'ADMIN') {
        client.join('admins');
        this.logger.log(`Admin ${userId} connected and joined 'admins' room`);
      } else {
        this.logger.log(`User ${userId} connected and joined 'user_${userId}' room`);
      }
    } catch (error) {
      this.logger.error(`Connection authentication failed for client ${client.id}: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  sendToUser(userId: string, data: any) {
    this.server.to(`user_${userId}`).emit('notification', data);
  }

  sendToAdmins(data: any) {
    this.server.to('admins').emit('notification', data);
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket) {
    return { event: 'pong', data: 'hello' };
  }
}
