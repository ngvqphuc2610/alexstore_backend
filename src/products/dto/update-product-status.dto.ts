import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ProductStatus } from '@prisma/client';

export class UpdateProductStatusDto {
    @ApiProperty({ enum: ProductStatus, description: 'Status of the product' })
    @IsEnum(ProductStatus)
    status: ProductStatus;
}
