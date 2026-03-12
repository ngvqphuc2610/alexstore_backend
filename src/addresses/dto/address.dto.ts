import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAddressDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    fullName: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    @MaxLength(20)
    phoneNumber?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    province?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    district?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    ward?: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    addressLine: string;

    @ApiProperty({ required: false, default: false })
    @IsBoolean()
    @IsOptional()
    isDefault?: boolean;
}

export class UpdateAddressDto {
    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    fullName?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    @MaxLength(20)
    phoneNumber?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    province?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    district?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    @MaxLength(100)
    ward?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    @MaxLength(255)
    addressLine?: string;

    @ApiProperty({ required: false })
    @IsBoolean()
    @IsOptional()
    isDefault?: boolean;
}
