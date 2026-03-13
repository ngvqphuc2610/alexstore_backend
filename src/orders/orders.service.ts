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
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class OrdersService {
    constructor(
        private prisma: PrismaService,
        private eventEmitter: EventEmitter2
    ) { }

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

            // ─── Step 3: validate address and create order ─────────────────────
            const orderId = generateUuidV7();
            const orderCode = this.generateOrderCode();

            const addressId = uuidToBuffer(dto.addressId);
            const address = await tx.address.findFirst({
                where: { id: addressId as any, userId: buyerId as any, isDeleted: false }
            });

            if (!address) {
                throw new NotFoundException('Selected address not found or has been deleted');
            }

            const shippingAddressStr = `${address.addressLine}, ${address.ward}, ${address.district}, ${address.province}`;

            const newOrder = await tx.order.create({
                data: {
                    id: orderId as any,
                    orderCode,
                    buyerId: buyerId as any,
                    totalAmount,
                    shippingName: address.fullName,
                    shippingPhone: address.phoneNumber,
                    shippingAddress: shippingAddressStr,
                    paymentMethod: dto.paymentMethod,
                } as any,
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
                include: { orderItems: { include: { product: { select: { sellerId: true } } } } },
            });
        });

        if (!order) {
            throw new NotFoundException('Failed to create order');
        }

        const uniqueSellerIds = new Set<string>();
        if (order.orderItems) {
            for (const item of order.orderItems) {
                if (item.product?.sellerId) {
                    uniqueSellerIds.add(bufferToUuid(item.product.sellerId));
                }
            }
        }

        const orderIdStr = bufferToUuid(order.id);
        for (const sellerIdStr of uniqueSellerIds) {
            this.eventEmitter.emit('order.created', {
                orderId: orderIdStr,
                orderCode: order.orderCode,
                buyerIdStr,
                sellerIdStr
            });
        }

        return this.serializeOrder(order);
    }

    async findByBuyer(buyerIdStr: string, params?: { status?: OrderStatus; page?: number; limit?: number; search?: string }) {
        const buyerId = uuidToBuffer(buyerIdStr);
        const { status, page = 1, limit = 10, search } = params || {};
        const skip = (page - 1) * limit;

        const where: any = { buyerId, isDeleted: false };
        if (status) where.status = status;
        if (search) {
            where.OR = [
                { orderCode: { contains: search, mode: 'insensitive' } },
                { orderItems: { some: { product: { name: { contains: search, mode: 'insensitive' } } } } }
            ];
        }

        const [total, orders] = await Promise.all([
            this.prisma.order.count({ where }),
            this.prisma.order.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: { 
                    orderItems: { 
                        include: { 
                            product: { 
                                select: { 
                                    name: true, 
                                    images: true, 
                                    seller: { select: { username: true } },
                                    reviews: {
                                        where: { buyerId: buyerId },
                                        select: { id: true }
                                    }
                                } 
                            } 
                        } 
                    } 
                },
            }),
        ]);

        return {
            data: orders.map((o) => {
                const serialized = this.serializeOrder(o);
                // Inject hasReviewed flag for each item
                serialized.orderItems = serialized.orderItems.map((item: any) => ({
                    ...item,
                    hasReviewed: (o.orderItems?.find(oi => Number(oi.id) === item.id)?.product as any)?.reviews?.length > 0
                }));
                return serialized;
            }),
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
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

    async findAll(params: { status?: OrderStatus; page: number; limit: number }) {
        const { status, page, limit } = params;
        const skip = (page - 1) * limit;

        const where: any = { isDeleted: false };
        if (status) where.status = status;

        const [total, orders] = await Promise.all([
            this.prisma.order.count({ where }),
            this.prisma.order.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    buyer: { select: { username: true, email: true } },
                    orderItems: { include: { product: { select: { name: true } } } }
                },
            }),
        ]);

        return {
            data: orders.map((o) => {
                const serialized = this.serializeOrder(o);
                return {
                    ...serialized,
                    buyer: o.buyer,
                };
            }),
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async findOne(idStr: string, userId: string, userRole: Role) {
        const id = uuidToBuffer(idStr);
        const order = await this.prisma.order.findFirst({
            where: { id, isDeleted: false },
            include: { 
                buyer: { select: { username: true, email: true } },
                orderItems: { include: { product: { select: { id: true, name: true, images: true, seller: { select: { username: true } } } } } } 
            },
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

        this.eventEmitter.emit('order.status_updated', {
            orderId: idStr,
            orderCode: updated.orderCode,
            buyerIdStr: bufferToUuid(updated.buyerId),
            newStatus: status
        });

        return this.serializeOrder(updated);
    }

    async confirmReceipt(idStr: string, buyerIdStr: string) {
        const id = uuidToBuffer(idStr);
        const buyerId = uuidToBuffer(buyerIdStr);

        const order = await this.prisma.order.findUnique({
            where: { id, isDeleted: false },
        });

        if (!order) {
            throw new NotFoundException('Order not found');
        }

        if (bufferToUuid(order.buyerId) !== buyerIdStr) {
            throw new ForbiddenException('Not your order');
        }

        if (!['SHIPPING', 'PAID'].includes(order.status)) {
            throw new BadRequestException('Order cannot be confirmed');
        }

        const updated = await this.prisma.order.update({
            where: { id },
            data: {
                status: 'DELIVERED',
                deliveredAt: new Date(),
            },
        });

        this.eventEmitter.emit('order.status_updated', {
            orderId: idStr,
            orderCode: updated.orderCode,
            buyerIdStr: buyerIdStr,
            newStatus: 'DELIVERED'
        });

        return this.serializeOrder(updated);
    }

    async getSellerAnalytics(sellerIdStr: string, range: string = '30d') {
        const sellerId = uuidToBuffer(sellerIdStr);

        // 1. Determine Date Ranges
        const now = new Date();
        now.setHours(23, 59, 59, 999); // End of today

        // Default to 30 days
        let days = 30;
        let isMonth = false;

        if (range === '7d') days = 7;
        else if (range === '30d') days = 30;
        else if (range === 'this_month') {
            isMonth = true;
            days = now.getDate(); // Days passed in current month
        }

        const currentStartDate = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
        currentStartDate.setHours(0, 0, 0, 0);

        const previousEndDate = new Date(currentStartDate.getTime() - 1);
        const previousStartDate = new Date(previousEndDate.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
        previousStartDate.setHours(0, 0, 0, 0);

        // 2. Fetch all orders that have products belonging to this seller
        const orders = await this.prisma.order.findMany({
            where: {
                isDeleted: false,
                orderItems: {
                    some: { product: { sellerId: sellerId } },
                },
                createdAt: { gte: previousStartDate }
            },
            include: {
                orderItems: {
                    include: {
                        product: { select: { id: true, sellerId: true, name: true } },
                    },
                },
            },
            orderBy: { createdAt: 'asc' }
        });

        // 3. Initialize Data Structures
        let currentRevenue = 0;
        let previousRevenue = 0;
        let currentOrdersCount = 0;
        let previousOrdersCount = 0;

        const chartDataMap = new Map<string, { sales: number, orders: number }>();
        const topProductsMap = new Map<string, number>();
        const orderStatusMap = new Map<string, number>();

        // Pre-fill chartDataMap with zeroes for the current period
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); // e.g. "05 Mar"
            chartDataMap.set(dateStr, { sales: 0, orders: 0 });
        }

        // 4. Process Orders
        for (const order of orders) {
            // Filter items to only count this seller's products
            const sellerItems = order.orderItems.filter(
                (item: any) => bufferToUuid(item.product.sellerId) === sellerIdStr
            );
            if (sellerItems.length === 0) continue;

            const orderDate = new Date(order.createdAt);
            const isCurrentPeriod = orderDate >= currentStartDate && orderDate <= now;
            const isPreviousPeriod = orderDate >= previousStartDate && orderDate <= previousEndDate;

            // Only count non-cancelled orders for Revenue calculations
            const isNonCancelled = order.status !== OrderStatus.CANCELLED;
            const orderRevenue = sellerItems.reduce((sum, item) => sum + (Number(item.priceAtPurchase) * item.quantity), 0);

            if (isCurrentPeriod) {
                // Main stats
                currentOrdersCount++;
                if (isNonCancelled) currentRevenue += orderRevenue;

                // Order Status count
                orderStatusMap.set(order.status, (orderStatusMap.get(order.status) || 0) + 1);

                // Chart Data (Line Chart)
                if (isNonCancelled) {
                    const dateStr = orderDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                    if (chartDataMap.has(dateStr)) {
                        const current = chartDataMap.get(dateStr)!;
                        chartDataMap.set(dateStr, { sales: current.sales + orderRevenue, orders: current.orders + 1 });
                    }
                }

                // Top Products (only non-cancelled, but counting quantities)
                if (isNonCancelled) {
                    for (const item of sellerItems) {
                        const productName = item.product.name;
                        topProductsMap.set(productName, (topProductsMap.get(productName) || 0) + item.quantity);
                    }
                }
            } else if (isPreviousPeriod) {
                // Previous stats for % comparison
                previousOrdersCount++;
                if (isNonCancelled) previousRevenue += orderRevenue;
            }
        }

        // 5. Format Output
        const chartData = Array.from(chartDataMap.entries()).map(([date, data]) => ({
            date,
            sales: data.sales,
            orders: data.orders
        }));

        const topProducts = Array.from(topProductsMap.entries())
            .map(([name, sold]) => ({ name, sold }))
            .sort((a, b) => b.sold - a.sold)
            .slice(0, 5); // Top 5

        const orderStatusData = Array.from(orderStatusMap.entries()).map(([name, value]) => ({
            name,
            value
        }));

        return {
            summary: {
                currentRevenue,
                previousRevenue,
                currentOrders: currentOrdersCount,
                previousOrders: previousOrdersCount
            },
            chartData,
            topProducts,
            orderStatusData
        };
    }
}
