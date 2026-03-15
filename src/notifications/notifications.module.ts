import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsListener } from './notifications.listener';
import { NotificationsGateway } from './notifications.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    PrismaModule, 
    UsersModule, 
    MailModule,
    AuthModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsListener, NotificationsGateway],
  exports: [NotificationsService, NotificationsGateway]
})
export class NotificationsModule {}
