import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { uuidToBuffer, bufferToUuid } from '../common/helpers/uuid.helper';

@Injectable()
export class FavoritesService {
  constructor(private prisma: PrismaService) {}

  async getFavorites(userIdStr: string) {
    const userId = uuidToBuffer(userIdStr);
    const favorites = await this.prisma.favorite.findMany({
      where: { userId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            price: true,
            stockQuantity: true,
            avgRating: true,
            reviewCount: true,
            status: true,
            images: {
              where: { isPrimary: true },
              take: 1,
            },
            seller: {
              select: {
                username: true,
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return favorites.map(fav => ({
      id: Number(fav.id),
      productId: bufferToUuid(fav.productId),
      createdAt: fav.createdAt,
      product: {
        ...fav.product,
        id: bufferToUuid(fav.product.id),
        price: Number(fav.product.price),
        avgRating: Number(fav.product.avgRating),
      }
    }));
  }

  async addFavorite(userIdStr: string, productIdStr: string) {
    const userId = uuidToBuffer(userIdStr);
    const productId = uuidToBuffer(productIdStr);

    const product = await this.prisma.product.findUnique({
      where: { id: productId, isDeleted: false, status: 'APPROVED' }
    });

    if (!product) {
      throw new NotFoundException('Product not found or unavailable');
    }

    const existing = await this.prisma.favorite.findUnique({
      where: {
        uq_favorite_user_product: {
          userId,
          productId
        }
      }
    });

    if (existing) {
      throw new ConflictException('Product is already in your wishlist');
    }

    const favorite = await this.prisma.favorite.create({
      data: {
        userId,
        productId
      }
    });

    return {
      message: 'Product added to wishlist',
      id: Number(favorite.id)
    };
  }

  async removeFavorite(userIdStr: string, productIdStr: string) {
    const userId = uuidToBuffer(userIdStr);
    const productId = uuidToBuffer(productIdStr);

    const favorite = await this.prisma.favorite.findUnique({
      where: {
        uq_favorite_user_product: {
          userId,
          productId
        }
      }
    });

    if (!favorite) {
      throw new NotFoundException('Product not found in wishlist');
    }

    await this.prisma.favorite.delete({
      where: {
        uq_favorite_user_product: {
          userId,
          productId
        }
      }
    });

    return { message: 'Product removed from wishlist' };
  }
}
