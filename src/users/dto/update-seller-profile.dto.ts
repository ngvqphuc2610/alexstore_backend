import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateSellerProfileDto {
    @ApiPropertyOptional({ example: 'Phuc Store', description: 'Tên cửa hàng' })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    shopName?: string;

    @ApiPropertyOptional({ example: '0123456789', description: 'Mã số thuế' })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    taxCode?: string;

    @ApiPropertyOptional({ example: '123 Đường ABC, Quận 1, TP.HCM', description: 'Địa chỉ lấy hàng' })
    @IsOptional()
    @IsString()
    pickupAddress?: string;

    @ApiPropertyOptional({ example: 'Bio of the shop', description: 'Mô tả ngắn gọn về shop' })
    @IsOptional()
    @IsString()
    description?: string;
}
