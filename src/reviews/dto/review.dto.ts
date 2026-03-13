import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, Min, Max, IsOptional } from 'class-validator';

export class CreateReviewDto {
    @ApiProperty({ example: 'product-uuid', description: 'ID of the product' })
    @IsString()
    productId: string;

    @ApiProperty({ example: 5, description: 'Rating from 1 to 5', minimum: 1, maximum: 5 })
    @IsInt()
    @Min(1)
    @Max(5)
    rating: number;

    @ApiProperty({ example: 'Great product!', description: 'Review comment', required: false })
    @IsString()
    @IsOptional()
    comment?: string;
}
