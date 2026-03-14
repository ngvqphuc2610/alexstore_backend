import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsListener } from './notifications.listener';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PrismaModule, UsersModule, MailModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsListener]
})
export class NotificationsModule {}
