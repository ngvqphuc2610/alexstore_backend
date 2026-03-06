import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsString,
    IsNumber,
    IsInt,
    IsOptional,
    Min,
    IsArray,
} from 'class-validator';

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

    @ApiPropertyOptional({ description: 'List of image URLs to save during creation' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    imageUrls?: string[];
}
