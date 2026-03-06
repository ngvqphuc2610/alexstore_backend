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
    UseInterceptors,
    UploadedFile,
    ParseIntPipe,
    Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiConsumes, ApiBody } from '@nestjs/swagger';
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

@ApiTags('Products')
@Controller('products')
export class ProductsController {
    constructor(private readonly productsService: ProductsService) { }

    @Get()
    @ApiOperation({ summary: 'Find all products' })
    @ApiQuery({ name: 'categoryId', required: false, type: Number })
    @ApiQuery({ name: 'sellerId', required: false, type: String })
    @ApiQuery({ name: 'status', required: false, type: String })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiResponse({ status: 200, description: 'Return all products.' })
    findAll(
        @Query('categoryId') categoryId?: string,
        @Query('sellerId') sellerId?: string,
        @Query('status') status?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.productsService.findAll({
            categoryId: categoryId ? Number(categoryId) : undefined,
            sellerId,
            status: status as any,
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 20,
        });
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get product by ID' })
    @ApiResponse({ status: 200, description: 'Return the product.' })
    @ApiResponse({ status: 404, description: 'Product not found.' })
    findOne(@Param('id') id: string) {
        return this.productsService.findOne(id);
    }

    @Post()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SELLER, Role.ADMIN)
    @ApiOperation({ summary: 'Create a new product' })
    @ApiResponse({ status: 201, description: 'Product successfully created.' })
    @ApiResponse({ status: 403, description: 'Forbidden.' })
    create(
        @Body() dto: CreateProductDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.productsService.create(dto, userId);
    }

    @Put(':id')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SELLER, Role.ADMIN)
    @ApiOperation({ summary: 'Update a product' })
    @ApiResponse({ status: 200, description: 'Product successfully updated.' })
    @ApiResponse({ status: 403, description: 'Forbidden.' })
    @ApiResponse({ status: 404, description: 'Product not found.' })
    update(
        @Param('id') id: string,
        @Body() dto: UpdateProductDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: Role,
    ) {
        return this.productsService.update(id, dto, userId, userRole);
    }

    @Patch(':id/status')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Update product status (Admin only)' })
    @ApiResponse({ status: 200, description: 'Product status successfully updated.' })
    @ApiResponse({ status: 403, description: 'Forbidden.' })
    updateStatus(
        @Param('id') id: string,
        @Body() dto: UpdateProductStatusDto,
    ) {
        return this.productsService.updateStatus(id, dto);
    }

    @Delete(':id')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SELLER, Role.ADMIN)
    @ApiOperation({ summary: 'Delete a product' })
    @ApiResponse({ status: 200, description: 'Product successfully deleted.' })
    @ApiResponse({ status: 403, description: 'Forbidden.' })
    @ApiResponse({ status: 404, description: 'Product not found.' })
    remove(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: Role,
    ) {
        return this.productsService.softDelete(id, userId, userRole);
    }

    @Post(':id/images')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SELLER, Role.ADMIN)
    @ApiOperation({ summary: 'Upload a product image' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    })
    @UseInterceptors(FileInterceptor('file', {
        storage: diskStorage({
            destination: './uploads',
            filename: (req, file, cb) => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
                cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
            }
        })
    }))
    uploadImage(
        @Param('id') id: string,
        @UploadedFile() file: Express.Multer.File,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: Role,
        @Req() req: any,
    ) {
        return this.productsService.uploadImage(id, file, userId, userRole);
    }

    @Delete(':id/images/:imageId')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SELLER, Role.ADMIN)
    @ApiOperation({ summary: 'Delete a product image' })
    @ApiResponse({ status: 200, description: 'Image successfully deleted.' })
    @ApiResponse({ status: 403, description: 'Forbidden.' })
    @ApiResponse({ status: 404, description: 'Image not found.' })
    removeImage(
        @Param('id') id: string,
        @Param('imageId', ParseIntPipe) imageId: number,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: Role,
    ) {
        return this.productsService.removeImage(id, imageId, userId, userRole);
    }

    @Post(':id/images/url')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SELLER, Role.ADMIN)
    @ApiOperation({ summary: 'Add a product image via URL' })
    @ApiResponse({ status: 201, description: 'Image successfully added.' })
    @ApiResponse({ status: 403, description: 'Forbidden.' })
    @ApiResponse({ status: 404, description: 'Product not found.' })
    addImageUrl(
        @Param('id') id: string,
        @Body('imageUrl') imageUrl: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: Role,
    ) {
        return this.productsService.addImageUrl(id, imageUrl, userId, userRole);
    }

    @Patch(':id/images/:imageId/primary')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.SELLER, Role.ADMIN)
    @ApiOperation({ summary: 'Set a product image as primary' })
    @ApiResponse({ status: 200, description: 'Image set as primary successfully.' })
    @ApiResponse({ status: 403, description: 'Forbidden.' })
    @ApiResponse({ status: 404, description: 'Image or product not found.' })
    setPrimaryImage(
        @Param('id') id: string,
        @Param('imageId', ParseIntPipe) imageId: number,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: Role,
    ) {
        return this.productsService.setPrimaryImage(id, imageId, userId, userRole);
    }
}
