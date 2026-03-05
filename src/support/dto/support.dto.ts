import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { SupportRequestStatus } from '@prisma/client';

export class CreateSupportRequestDto {
    @ApiProperty({
        description: 'Type of support request',
        example: 'CATEGORY_REQ',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    type: string;

    @ApiProperty({
        description: 'Title of the request',
        example: 'Đăng ký danh mục mới: Thiết bị gia dụng',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    title: string;

    @ApiProperty({
        description: 'Detailed description of the issue or request',
    })
    @IsString()
    @IsNotEmpty()
    description: string;
}

export class AdminReplyDto {
    @ApiProperty({
        description: 'Reply message from admin',
    })
    @IsString()
    @IsNotEmpty()
    adminReply: string;

    @ApiProperty({
        description: 'New status of the request',
        enum: SupportRequestStatus,
    })
    @IsEnum(SupportRequestStatus)
    status: SupportRequestStatus;
}

export class UpdateSupportRequestStatusDto {
    @ApiProperty({
        enum: SupportRequestStatus,
    })
    @IsEnum(SupportRequestStatus)
    status: SupportRequestStatus;
}
