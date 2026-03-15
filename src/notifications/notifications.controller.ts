import { Controller, Get, Patch, Param, UseGuards, Query, Body } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('email-logs')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  getEmailLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.getEmailLogs(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20
    );
  }

  @Get()
  getNotifications(@CurrentUser('id') userId: string, @Query('limit') limit?: string) {
    return this.notificationsService.getUserNotifications(userId, limit ? parseInt(limit, 10) : 20);
  }

  @Get('settings')
  getSettings(@CurrentUser('id') userId: string) {
    return this.notificationsService.getSettings(userId);
  }

  @Patch('settings')
  updateSettings(@CurrentUser('id') userId: string, @Body() data: any) {
    return this.notificationsService.updateSettings(userId, data);
  }

  @Patch('read-all')
  markAllAsRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }

  @Patch(':id/read')
  markAsRead(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.notificationsService.markAsRead(userId, parseInt(id, 10));
  }
}
