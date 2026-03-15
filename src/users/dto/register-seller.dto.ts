import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class RegisterSellerDto {
    @ApiProperty({ example: 'Phuc Store', description: 'Tên cửa hàng' })
    @IsString()
    @MaxLength(100)
    shopName: string;

    @ApiProperty({ example: '0123456789', required: false, description: 'Mã số thuế' })
    @IsString()
    @IsOptional()
    @MaxLength(50)
    taxCode?: string;

    @ApiProperty({ example: '123 Đường ABC, Quận 1, TP.HCM', required: false, description: 'Địa chỉ lấy hàng' })
    @IsString()
    @IsOptional()
    pickupAddress?: string;
}
