import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsNumber,
    IsInt,
    IsOptional,
    IsEnum,
    Min,
} from 'class-validator';
import { ProductStatus } from '@prisma/client';

export class CreateProductDto {
    @ApiProperty({ example: 1, description: 'ID of the category' })
    @IsInt()
    categoryId: number;

    @ApiProperty({ example: 'iPhone 15 Pro', description: 'Name of the product' })
    @IsString()
    name: string;

    @ApiPropertyOptional({ example: 'The latest iPhone from Apple', description: 'Description of the product' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({ example: 999.99, description: 'Price of the product' })
    @IsNumber()
    @Min(0)
    price: number;

    @ApiProperty({ example: 50, description: 'Stock quantity' })
    @IsInt()
    @Min(0)
    stockQuantity: number;
}

export class UpdateProductDto {
    @ApiPropertyOptional({ example: 1, description: 'ID of the category' })
    @IsOptional()
    @IsInt()
    categoryId?: number;

    @ApiPropertyOptional({ example: 'iPhone 15 Pro Max', description: 'Name of the product' })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({ example: 'The biggest iPhone from Apple', description: 'Description of the product' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ example: 1099.99, description: 'Price of the product' })
    @IsOptional()
    @IsNumber()
    @Min(0)
    price?: number;

    @ApiPropertyOptional({ example: 100, description: 'Stock quantity' })
    @IsOptional()
    @IsInt()
    @Min(0)
    stockQuantity?: number;
}

export class UpdateProductStatusDto {
    @ApiProperty({ enum: ProductStatus, description: 'Status of the product' })
    @IsEnum(ProductStatus)
    status: ProductStatus;
}
