import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';
import {
    generateUuidV7,
    uuidToBuffer,
    bufferToUuid,
} from '../common/helpers/uuid.helper';

@Injectable()
export class CartService {
    constructor(private prisma: PrismaService) { }

    private async getOrCreateCart(buyerIdStr: string) {
        const buyerId = uuidToBuffer(buyerIdStr);
        let cart = await this.prisma.cart.findUnique({
            where: { buyerId },
            include: {
                cartItems: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                name: true,
                                price: true,
                                images: { where: { isPrimary: true }, take: 1 },
                            },
                        },
                    },
                },
            },
        });

        if (!cart) {
            const id = generateUuidV7();
            cart = await this.prisma.cart.create({
                data: { id, buyerId },
                include: {
                    cartItems: {
                        include: { product: { select: { id: true, name: true, price: true, images: { where: { isPrimary: true }, take: 1 } } } },
                    },
                },
            });
        }

        return cart;
    }

    async getCart(userId: string) {
        const cart = await this.getOrCreateCart(userId);
        return {
            id: bufferToUuid(cart.id),
            items: cart.cartItems.map((item) => ({
                id: Number(item.id),
                quantity: item.quantity,
                product: {
                    id: bufferToUuid(item.product.id),
                    name: item.product.name,
                    price: Number(item.product.price),
                    images: item.product.images?.map((img: any) => ({
                        id: Number(img.id),
                        imageUrl: img.imageUrl,
                        isPrimary: img.isPrimary,
                    })) || [],
                },
            })),
        };
    }

    async addItem(userId: string, dto: AddCartItemDto) {
        const cart = await this.getOrCreateCart(userId);
        const productId = uuidToBuffer(dto.productId);

        const product = await this.prisma.product.findFirst({
            where: { id: productId, isDeleted: false, status: 'APPROVED' },
        });

        if (!product) {
            throw new NotFoundException('Product not found or not available');
        }

        if (product.stockQuantity < dto.quantity) {
            throw new BadRequestException(
                `Only ${product.stockQuantity} items available`,
            );
        }

        const existing = await this.prisma.cartItem.findUnique({
            where: { uq_cart_product: { cartId: cart.id, productId } },
        });

        if (existing) {
            return this.prisma.cartItem.update({
                where: { id: existing.id },
                data: { quantity: existing.quantity + dto.quantity },
            });
        }

        return this.prisma.cartItem.create({
            data: { cartId: cart.id, productId, quantity: dto.quantity },
        });
    }

    async updateItem(userId: string, itemId: number, dto: UpdateCartItemDto) {
        const cart = await this.getOrCreateCart(userId);
        const item = await this.prisma.cartItem.findFirst({
            where: { id: itemId, cartId: cart.id },
        });
        if (!item) throw new NotFoundException('Cart item not found');

        return this.prisma.cartItem.update({
            where: { id: itemId },
            data: { quantity: dto.quantity },
        });
    }

    async removeItem(userId: string, itemId: number) {
        const cart = await this.getOrCreateCart(userId);
        const item = await this.prisma.cartItem.findFirst({
            where: { id: itemId, cartId: cart.id },
        });
        if (!item) throw new NotFoundException('Cart item not found');

        await this.prisma.cartItem.delete({ where: { id: itemId } });
        return { message: 'Item removed from cart' };
    }
}
