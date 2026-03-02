import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Patch,
    Param,
    Body,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import {
    CreateProductDto,
    UpdateProductDto,
    UpdateProductStatusDto,
} from './dto/product.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('products')
export class ProductsController {
    constructor(private readonly productsService: ProductsService) { }

    @Get()
    findAll(
        @Query('categoryId') categoryId?: string,
        @Query('sellerId') sellerId?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.productsService.findAll({
            categoryId: categoryId ? Number(categoryId) : undefined,
            sellerId,
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 20,
        });
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.productsService.findOne(id);
    }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SELLER, Role.ADMIN)
    create(
        @Body() dto: CreateProductDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.productsService.create(dto, userId);
    }

    @Put(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SELLER, Role.ADMIN)
    update(
        @Param('id') id: string,
        @Body() dto: UpdateProductDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: Role,
    ) {
        return this.productsService.update(id, dto, userId, userRole);
    }

    @Patch(':id/status')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    updateStatus(
        @Param('id') id: string,
        @Body() dto: UpdateProductStatusDto,
    ) {
        return this.productsService.updateStatus(id, dto);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SELLER, Role.ADMIN)
    remove(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: Role,
    ) {
        return this.productsService.softDelete(id, userId, userRole);
    }
}
