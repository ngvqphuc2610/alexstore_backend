import {
    Controller,
    Get,
    Post,
    Patch,
    Param,
    Body,
    UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PlaceOrderDto } from './dto/order.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role, OrderStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

class UpdateOrderStatusDto {
    @IsEnum(OrderStatus)
    status: OrderStatus;
}

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
    constructor(private readonly ordersService: OrdersService) { }

    @Post()
    @UseGuards(RolesGuard)
    @Roles(Role.BUYER)
    placeOrder(
        @CurrentUser('id') userId: string,
        @Body() dto: PlaceOrderDto,
    ) {
        return this.ordersService.placeOrder(userId, dto);
    }

    @Get()
    @UseGuards(RolesGuard)
    @Roles(Role.BUYER)
    findMyOrders(@CurrentUser('id') userId: string) {
        return this.ordersService.findByBuyer(userId);
    }

    @Get(':id')
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
    cancel(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.ordersService.cancel(id, userId);
    }

    @Patch(':id/status')
    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN, Role.SELLER)
    updateStatus(
        @Param('id') id: string,
        @Body() dto: UpdateOrderStatusDto,
    ) {
        return this.ordersService.updateStatus(id, dto.status);
    }
}
