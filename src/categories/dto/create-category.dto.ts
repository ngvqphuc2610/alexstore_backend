import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, IsEnum, IsArray } from 'class-validator';
import { SellerType } from '@prisma/client';

export class CreateCategoryDto {
    @ApiProperty({ example: 'Electronics', description: 'Name of the category' })
    @IsString()
    name: string;

    @ApiPropertyOptional({ example: 1, description: 'Parent category ID' })
    @IsOptional()
    @IsInt()
    parentId?: number;

    @ApiPropertyOptional({ enum: SellerType, isArray: true, example: ['STANDARD', 'MALL'] })
    @IsOptional()
    @IsArray()
    @IsEnum(SellerType, { each: true })
    allowedSellerTypes?: SellerType[];
}
