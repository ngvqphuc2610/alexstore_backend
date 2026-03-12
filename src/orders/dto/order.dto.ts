import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, ValidateNested, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemDto {
    @ApiProperty({ example: 'product-uuid', description: 'ID of the product' })
    @IsString()
    productId: string;

    @ApiProperty({ example: 1, description: 'Quantity of the product' })
    @IsInt()
    @Min(1)
    quantity: number;
}

export class PlaceOrderDto {
    @ApiProperty({ example: 'uuid', description: 'ID of the selected address' })
    @IsString()
    addressId: string;

    @ApiProperty({ type: [OrderItemDto], description: 'Items to order' })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => OrderItemDto)
    items: OrderItemDto[];

    @ApiProperty({ example: 'CREDIT_CARD', description: 'Payment method' })
    @IsString()
    paymentMethod: string;
}
