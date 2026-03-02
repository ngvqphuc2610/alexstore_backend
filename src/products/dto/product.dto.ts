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
    @IsInt()
    categoryId: number;

    @IsString()
    name: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsNumber()
    @Min(0)
    price: number;

    @IsInt()
    @Min(0)
    stockQuantity: number;
}

export class UpdateProductDto {
    @IsOptional()
    @IsInt()
    categoryId?: number;

    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    price?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    stockQuantity?: number;
}

export class UpdateProductStatusDto {
    @IsEnum(ProductStatus)
    status: ProductStatus;
}
