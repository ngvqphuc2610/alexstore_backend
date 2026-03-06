import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { AdminAnalyticsService } from './admin-analytics.service';

@ApiTags('Admin Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin-analytics')
export class AdminAnalyticsController {
    constructor(private readonly analyticsService: AdminAnalyticsService) { }

    @Get('overview')
    @ApiOperation({ summary: 'Get overall system stats' })
    async getOverview() {
        return this.analyticsService.getOverview();
    }

    @Get('revenue')
    @ApiOperation({ summary: 'Get revenue trends' })
    async getRevenueAnalytics(@Query('range') range?: string) {
        return this.analyticsService.getRevenueAnalytics(range);
    }

    @Get('orders')
    @ApiOperation({ summary: 'Get order trends and distribution' })
    async getOrdersAnalytics(@Query('range') range?: string) {
        return this.analyticsService.getOrdersAnalytics(range);
    }

    @Get('sellers')
    @ApiOperation({ summary: 'Get seller analytics' })
    async getSellersAnalytics() {
        return this.analyticsService.getSellersAnalytics();
    }

    @Get('products')
    @ApiOperation({ summary: 'Get product analytics' })
    async getProductsAnalytics() {
        return this.analyticsService.getProductsAnalytics();
    }
}
