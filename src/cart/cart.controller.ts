import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    ParseIntPipe,
    UseGuards,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('cart')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.BUYER)
export class CartController {
    constructor(private readonly cartService: CartService) { }

    @Get()
    getCart(@CurrentUser('id') userId: string) {
        return this.cartService.getCart(userId);
    }

    @Post('items')
    addItem(
        @CurrentUser('id') userId: string,
        @Body() dto: AddCartItemDto,
    ) {
        return this.cartService.addItem(userId, dto);
    }

    @Put('items/:id')
    updateItem(
        @CurrentUser('id') userId: string,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateCartItemDto,
    ) {
        return this.cartService.updateItem(userId, id, dto);
    }

    @Delete('items/:id')
    removeItem(
        @CurrentUser('id') userId: string,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.cartService.removeItem(userId, id);
    }
}
