import { Controller, Post, Get, Body, Param, UseGuards, Request } from '@nestjs/common';
import { DiscountService } from './discount.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';

@Controller('discounts')
export class DiscountController {
  constructor(private readonly discountService: DiscountService) {}

  @Get('public/system')
  findPublicSystemVouchers() {
    return this.discountService.findPublicVouchers();
  }

  @Get('public/shops/all')
  findAllPublicShopVouchers() {
    return this.discountService.findPublicVouchers('ALL_SHOPS');
  }

  @Get('public/shop/:shopId')
  findPublicShopVouchers(@Param('shopId') shopId: string) {
    return this.discountService.findPublicVouchers(shopId);
  }

  @Post('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  createSystemVoucher(@Body() dto: CreateDiscountDto) {
    return this.discountService.create(dto);
  }

  @Post('seller')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER)
  createShopVoucher(@Body() dto: CreateDiscountDto, @CurrentUser() user: any) {
    return this.discountService.create(dto, user.id);
  }

  @Post('wallet/:id')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  saveVoucher(@Param('id') id: string, @CurrentUser() user: any) {
    // Rate limiter configured via Throttle decorator prevents bot scraping (max 5/min)
    return this.discountService.saveVoucher(user.id, id);
  }

  @Get('wallet')
  @UseGuards(JwtAuthGuard)
  getWallet(@CurrentUser() user: any) {
    return this.discountService.getWallet(user.id);
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findSystemVouchers() {
    return this.discountService.findSystemVouchers();
  }

  @Get('seller')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SELLER)
  findShopVouchers(@CurrentUser() user: any) {
    return this.discountService.findShopVouchers(user.id);
  }
}
