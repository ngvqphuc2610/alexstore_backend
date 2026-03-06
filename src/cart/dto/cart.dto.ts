import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, Min } from 'class-validator';

export class AddCartItemDto {
    @ApiProperty({ example: 'product-uuid', description: 'ID of the product' })
    @IsString()
    productId: string;

    @ApiProperty({ example: 2, description: 'Quantity of the product' })
    @IsInt()
    @Min(1)
    quantity: number;
}

export class UpdateCartItemDto {
    @ApiProperty({ example: 3, description: 'New quantity of the cart item' })
    @IsInt()
    @Min(1)
    quantity: number;
}
