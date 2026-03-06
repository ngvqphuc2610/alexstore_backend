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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CartService } from './cart.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Cart')
@ApiBearerAuth()
@Controller('cart')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.BUYER)
export class CartController {
    constructor(private readonly cartService: CartService) { }

    @Get()
    @ApiOperation({ summary: 'Get current user shoping cart' })
    @ApiResponse({ status: 200, description: 'Return the shopping cart.' })
    @ApiResponse({ status: 401, description: 'Unauthorized.' })
    getCart(@CurrentUser('id') userId: string) {
        return this.cartService.getCart(userId);
    }

    @Post('items')
    @ApiOperation({ summary: 'Add item to shopping cart' })
    @ApiResponse({ status: 201, description: 'Item successfully added to cart.' })
    @ApiResponse({ status: 400, description: 'Bad Request.' })
    @ApiResponse({ status: 401, description: 'Unauthorized.' })
    addItem(
        @CurrentUser('id') userId: string,
        @Body() dto: AddCartItemDto,
    ) {
        return this.cartService.addItem(userId, dto);
    }

    @Put('items/:id')
    @ApiOperation({ summary: 'Update cart item quantity' })
    @ApiResponse({ status: 200, description: 'Cart item successfully updated.' })
    @ApiResponse({ status: 400, description: 'Bad Request.' })
    @ApiResponse({ status: 401, description: 'Unauthorized.' })
    @ApiResponse({ status: 404, description: 'Cart item not found.' })
    updateItem(
        @CurrentUser('id') userId: string,
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateCartItemDto,
    ) {
        return this.cartService.updateItem(userId, id, dto);
    }

    @Delete('items/:id')
    @ApiOperation({ summary: 'Remove item from shopping cart' })
    @ApiResponse({ status: 200, description: 'Item successfully removed from cart.' })
    @ApiResponse({ status: 401, description: 'Unauthorized.' })
    @ApiResponse({ status: 404, description: 'Cart item not found.' })
    removeItem(
        @CurrentUser('id') userId: string,
        @Param('id', ParseIntPipe) id: number,
    ) {
        return this.cartService.removeItem(userId, id);
    }
}
