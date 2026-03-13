import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('favorites')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  @Roles(Role.BUYER)
  getFavorites(@CurrentUser('id') userId: string) {
    return this.favoritesService.getFavorites(userId);
  }

  @Post()
  @Roles(Role.BUYER)
  addFavorite(@CurrentUser('id') userId: string, @Body() body: { productId: string }) {
    return this.favoritesService.addFavorite(userId, body.productId);
  }

  @Delete(':productId')
  @Roles(Role.BUYER)
  removeFavorite(@CurrentUser('id') userId: string, @Param('productId') productId: string) {
    return this.favoritesService.removeFavorite(userId, productId);
  }
}
