import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlaceOrderDto } from './dto/order.dto';
import {
    generateUuidV7,
    uuidToBuffer,
    bufferToUuid,
} from '../common/helpers/uuid.helper';
import { OrderStatus, Role } from '@prisma/client';

@Injectable()
export class OrdersService {
    constructor(private prisma: PrismaService) { }

    private generateOrderCode(): string {
        const now = new Date();
        const dateStr = now
            .toISOString()
            .slice(0, 10)
            .replace(/-/g, '');
        const rand = Math.floor(Math.random() * 1_000_000)
            .toString()
            .padStart(6, '0');
        return `ORD-${dateStr}-${rand}`;
    }

    private serializeOrder(order: any) {
        return {
            ...order,
            id: bufferToUuid(order.id),
            buyerId: bufferToUuid(order.buyerId),
            totalAmount: Number(order.totalAmount),
            orderItems: order.orderItems?.map((item: any) => ({
                ...item,
                id: Number(item.id),
                productId: bufferToUuid(item.productId),
                priceAtPurchase: Number(item.priceAtPurchase),
            })),
        };
    }

    /**
     * Place order inside a Prisma transaction:
     * 1. For each item: verify product (APPROVED, not deleted, stock >= qty)
     * 2. Deduct stock
     * 3. Create Order
     * 4. Create OrderItems
     */
    async placeOrder(buyerIdStr: string, dto: PlaceOrderDto) {
        const buyerId = uuidToBuffer(buyerIdStr);

        const order = await this.prisma.$transaction(async (tx) => {
            let totalAmount = 0;

            // ─── Step 1: validate all items ──────────────────────────────────
            const resolvedItems: Array<{
                productId: Uint8Array;
                quantity: number;
                priceAtPurchase: number;
            }> = [];

            for (const item of dto.items) {
                const productId = uuidToBuffer(item.productId);
                const product = await tx.product.findFirst({
                    where: { id: productId, isDeleted: false, status: 'APPROVED' },
                });

                if (!product) {
                    throw new NotFoundException(
                        `Product ${item.productId} not found or unavailable`,
                    );
                }

                if (product.stockQuantity < item.quantity) {
                    throw new BadRequestException(
                        `Insufficient stock for product "${product.name}". Available: ${product.stockQuantity}`,
                    );
                }

                const price = Number(product.price);
                totalAmount += price * item.quantity;
                // Re-use our locally created productId (Uint8Array<ArrayBuffer>)
                resolvedItems.push({ productId, quantity: item.quantity, priceAtPurchase: price });
            }

            // ─── Step 2: deduct stock ─────────────────────────────────────────
            for (const item of resolvedItems) {
                await tx.product.update({
                    where: { id: item.productId as unknown as Uint8Array<ArrayBuffer> },
                    data: { stockQuantity: { decrement: item.quantity } },
                });
            }

            // ─── Step 3: create order ─────────────────────────────────────────
            const orderId = generateUuidV7();
            const orderCode = this.generateOrderCode();

            const newOrder = await tx.order.create({
                data: {
                    id: orderId,
                    orderCode,
                    buyerId,
                    totalAmount,
                    shippingAddress: dto.shippingAddress,
                    paymentMethod: dto.paymentMethod,
                },
            });

            // ─── Step 4: create order items ───────────────────────────────────
            await tx.orderItem.createMany({
                data: resolvedItems.map((item) => ({
                    orderId: newOrder.id,
                    productId: item.productId as unknown as Uint8Array<ArrayBuffer>,
                    quantity: item.quantity,
                    priceAtPurchase: item.priceAtPurchase,
                })),
            });

            return tx.order.findUnique({
                where: { id: orderId },
                include: { orderItems: true },
            });
        });

        return this.serializeOrder(order);
    }

    async findByBuyer(buyerIdStr: string) {
        const buyerId = uuidToBuffer(buyerIdStr);
        const orders = await this.prisma.order.findMany({
            where: { buyerId, isDeleted: false },
            orderBy: { createdAt: 'desc' },
            include: { orderItems: { include: { product: { select: { name: true } } } } },
        });
        return orders.map((o) => this.serializeOrder(o));
    }

    async findBySeller(sellerIdStr: string) {
        const sellerId = uuidToBuffer(sellerIdStr);
        // Find orders where at least one item is a product belonging to this seller
        const orders = await this.prisma.order.findMany({
            where: {
                isDeleted: false,
                orderItems: {
                    some: {
                        product: {
                            sellerId: sellerId,
                        },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            include: {
                orderItems: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                name: true,
                                sellerId: true,
                            },
                        },
                    },
                },
            },
        });

        // Filter orderItems to only show products of THIS seller for each order? 
        // Usually, the seller only sees the items they sold in that order.
        return orders.map((o) => {
            const serialized = this.serializeOrder(o);
            // Optionally filter orderItems to only include this seller's products
            serialized.orderItems = serialized.orderItems.filter(
                (item: any) => bufferToUuid(item.product.sellerId) === sellerIdStr,
            );
            return serialized;
        });
    }

    async findOne(idStr: string, userId: string, userRole: Role) {
        const id = uuidToBuffer(idStr);
        const order = await this.prisma.order.findFirst({
            where: { id, isDeleted: false },
            include: { orderItems: { include: { product: { select: { id: true, name: true } } } } },
        });

        if (!order) throw new NotFoundException('Order not found');

        const buyerId = bufferToUuid(order.buyerId);
        if (userRole === Role.BUYER && buyerId !== userId) {
            throw new ForbiddenException('Access denied');
        }

        return this.serializeOrder(order);
    }

    async cancel(idStr: string, userId: string) {
        const id = uuidToBuffer(idStr);
        const order = await this.prisma.order.findFirst({
            where: { id, isDeleted: false },
        });
        if (!order) throw new NotFoundException('Order not found');

        const buyerId = bufferToUuid(order.buyerId);
        if (buyerId !== userId) throw new ForbiddenException('Access denied');

        if (order.status !== OrderStatus.PENDING) {
            throw new BadRequestException('Only PENDING orders can be cancelled');
        }

        // Restore stock in transaction
        await this.prisma.$transaction(async (tx) => {
            const items = await tx.orderItem.findMany({ where: { orderId: id } });
            for (const item of items) {
                await tx.product.update({
                    where: { id: item.productId },
                    data: { stockQuantity: { increment: item.quantity } },
                });
            }
            await tx.order.update({
                where: { id },
                data: { status: OrderStatus.CANCELLED },
            });
        });

        return { message: 'Order cancelled and stock restored' };
    }

    async updateStatus(idStr: string, status: OrderStatus) {
        const id = uuidToBuffer(idStr);
        const order = await this.prisma.order.findFirst({
            where: { id, isDeleted: false },
        });
        if (!order) throw new NotFoundException('Order not found');

        const updated = await this.prisma.order.update({
            where: { id },
            data: { status },
        });
        return this.serializeOrder(updated);
    }
}
