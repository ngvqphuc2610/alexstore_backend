import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { generateUuidV7 as uuidv7, uuidToBuffer as uuidToBytes, bufferToUuid as bytesToUuid } from '../common/helpers/uuid.helper';
import { DiscountStatus, DiscountType, Prisma, UserVoucherStatus, DiscountScopeType } from '@prisma/client';

@Injectable()
export class DiscountService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateDiscountDto, sellerId?: string) {
    const codeExists = await this.prisma.discount.findUnique({ where: { code: dto.code } });
    if (codeExists) throw new BadRequestException('Discount code already exists');

    const discountIdBytes = Buffer.from(uuidv7());
    
    // Create discount
    const discount = await this.prisma.discount.create({
      data: {
        id: discountIdBytes,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        scope: dto.scope,
        value: dto.value,
        minOrderValue: dto.minOrderValue || 0,
        maxDiscountAmount: dto.maxDiscountAmount,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        usageLimit: dto.usageLimit,
        targetAudience: dto.targetAudience,
        isPrivate: dto.isPrivate || false,
        sellerId: sellerId ? Buffer.from(uuidToBytes(sellerId)) : null,
      }
    });

    // Create scopes if needed
    if (dto.productId || dto.categoryId) {
      await this.prisma.discountScope.create({
        data: {
          discountId: discountIdBytes,
          productId: dto.productId ? Buffer.from(uuidToBytes(dto.productId)) : null,
          categoryId: dto.categoryId || null
        }
      });
    }

    return { ...discount, id: bytesToUuid(discount.id) };
  }

  async saveVoucher(userId: string, discountIdStr: string) {
    const userBytes = Buffer.from(uuidToBytes(userId));
    const discountBytes = Buffer.from(uuidToBytes(discountIdStr));

    // Verify discount exists and is active
    const discount = await this.prisma.discount.findUnique({ where: { id: discountBytes } });
    if (!discount) throw new NotFoundException('Voucher not found');
    if (discount.status !== DiscountStatus.ACTIVE || new Date() > discount.endDate) {
      throw new BadRequestException('Voucher is expired or inactive');
    }

    // Check usage limit overall vs usedCount
    if (discount.usedCount >= discount.usageLimit) {
      throw new BadRequestException('Voucher is fully claimed');
    }

    // Check if already in wallet
    const existing = await this.prisma.userVoucher.findUnique({
      where: { uq_user_voucher: { userId: userBytes, discountId: discountBytes } }
    });

    if (existing) {
      throw new BadRequestException('Voucher already saved in wallet');
    }

    const walletId = Buffer.from(uuidv7());
    await this.prisma.userVoucher.create({
      data: {
        id: walletId,
        userId: userBytes,
        discountId: discountBytes,
        status: UserVoucherStatus.SAVED
      }
    });

    return { message: 'Voucher saved successfully' };
  }

  async getWallet(userId: string) {
    const userBytes = Buffer.from(uuidToBytes(userId));
    const vouchers = await this.prisma.userVoucher.findMany({
      where: { userId: userBytes },
      include: {
        discount: true
      }
    });

    return vouchers.map(v => ({
      ...v,
      id: bytesToUuid(v.id),
      userId: bytesToUuid(v.userId),
      discountId: bytesToUuid(v.discountId),
      discount: {
        ...v.discount,
        id: bytesToUuid(v.discount.id),
        sellerId: v.discount.sellerId ? bytesToUuid(v.discount.sellerId) : null
      }
    }));
  }

  async findSystemVouchers() {
    const vouchers = await this.prisma.discount.findMany({
      where: { sellerId: null },
      orderBy: { createdAt: 'desc' },
      include: { scopes: true }
    });
    return vouchers.map(v => ({
       ...v,
       id: bytesToUuid(v.id)
    }));
  }

  async findShopVouchers(sellerId: string) {
    const sellerBytes = Buffer.from(uuidToBytes(sellerId));
    const vouchers = await this.prisma.discount.findMany({
      where: { sellerId: sellerBytes },
      orderBy: { createdAt: 'desc' },
      include: { scopes: true }
    });
    return vouchers.map(v => ({
       ...v,
       id: bytesToUuid(v.id),
       sellerId: v.sellerId ? bytesToUuid(v.sellerId) : null
    }));
  }

  async findPublicVouchers(sellerIdStr?: string) {
    const where: any = {
      status: DiscountStatus.ACTIVE,
      isPrivate: false,
      endDate: { gt: new Date() }
    };
    
    // If sellerIdStr is 'ALL_SHOPS', fetch all shop vouchers
    if (sellerIdStr === 'ALL_SHOPS') {
      where.sellerId = { not: null };
    } else if (sellerIdStr) {
      where.sellerId = Buffer.from(uuidToBytes(sellerIdStr));
    } else {
      where.sellerId = null; // System vouchers
    }

    const vouchers = await this.prisma.discount.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
    
    return vouchers.map(v => ({
      ...v,
      id: bytesToUuid(v.id),
      sellerId: v.sellerId ? bytesToUuid(v.sellerId) : null
    }));
  }
}
