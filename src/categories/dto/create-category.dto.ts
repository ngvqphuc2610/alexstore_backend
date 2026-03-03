import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt } from 'class-validator';

export class CreateCategoryDto {
    @ApiProperty({ example: 'Electronics', description: 'Name of the category' })
    @IsString()
    name: string;

    @ApiPropertyOptional({ example: 1, description: 'Parent category ID' })
    @IsOptional()
    @IsInt()
    parentId?: number;
}
