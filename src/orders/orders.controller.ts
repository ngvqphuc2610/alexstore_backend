import {
    Controller,
    Get,
    Post,
    Patch,
    Param,
    Body,
    UseGuards,
    Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { PlaceOrderDto } from './dto/order.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role, OrderStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

class UpdateOrderStatusDto {
    @ApiProperty({ enum: OrderStatus, description: 'New status of the order' })
    @IsEnum(OrderStatus)
    status: OrderStatus;
}

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) { }

    @Post()
    @UseGuards(RolesGuard)
    @Roles(Role.BUYER)
    @ApiOperation({ summary: 'Place a new order' })
    @ApiResponse({ status: 201, description: 'Order successfully placed.' })
    @ApiResponse({ status: 400, description: 'Bad Request.' })
    @ApiResponse({ status: 401, description: 'Unauthorized.' })
    placeOrder(
        @CurrentUser('id') userId: string,
        @Body() dto: PlaceOrderDto,
    ) {
        return this.ordersService.placeOrder(userId, dto);
    }

    @Get()
    @UseGuards(RolesGuard)
    @Roles(Role.BUYER)
    @ApiOperation({ summary: 'Get current user orders' })
    @ApiResponse({ status: 200, description: 'Return all orders for the current user.' })
    @ApiResponse({ status: 401, description: 'Unauthorized.' })
    findMyOrders(@CurrentUser('id') userId: string) {
        return this.ordersService.findByBuyer(userId);
    }

    @Get('seller/all')
    @UseGuards(RolesGuard)
    @Roles(Role.SELLER)
    @ApiOperation({ summary: 'Get current seller orders' })
    findSellerOrders(@CurrentUser('id') userId: string) {
        return this.ordersService.findBySeller(userId);
    }

    @Get('seller/analytics')
    @UseGuards(RolesGuard)
    @Roles(Role.SELLER)
    @ApiOperation({ summary: 'Get current seller analytics data for charts' })
    getSellerAnalytics(
        @CurrentUser('id') userId: string,
        @Query('range') range?: string,
    ) {
        return this.ordersService.getSellerAnalytics(userId, range);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get order by ID' })
    @ApiResponse({ status: 200, description: 'Return the order.' })
    @ApiResponse({ status: 401, description: 'Unauthorized.' })
    @ApiResponse({ status: 404, description: 'Order not found.' })
    findOne(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: Role,
    ) {
        return this.ordersService.findOne(id, userId, userRole);
    }

    @Patch(':id/cancel')
    @UseGuards(RolesGuard)
    @Roles(Role.BUYER)
    @ApiOperation({ summary: 'Cancel an order' })
    @ApiResponse({ status: 200, description: 'Order successfully cancelled.' })
    @ApiResponse({ status: 401, description: 'Unauthorized.' })
    @ApiResponse({ status: 404, description: 'Order not found.' })
    cancel(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.ordersService.cancel(id, userId);
    }

    @Patch(':id/status')
    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN, Role.SELLER)
    @ApiOperation({ summary: 'Update order status (Admin/Seller only)' })
    @ApiResponse({ status: 200, description: 'Order status successfully updated.' })
    @ApiResponse({ status: 403, description: 'Forbidden.' })
    @ApiResponse({ status: 404, description: 'Order not found.' })
    updateStatus(
        @Param('id') id: string,
        @Body() dto: UpdateOrderStatusDto,
    ) {
        return this.ordersService.updateStatus(id, dto.status);
    }
}
