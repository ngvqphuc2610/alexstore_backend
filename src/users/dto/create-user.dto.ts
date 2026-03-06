import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail, IsEnum, IsOptional, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
    @ApiProperty({ example: 'johndoe' })
    @IsString()
    username: string;

    @ApiProperty({ example: 'user@example.com' })
    @IsEmail()
    email: string;

    @ApiProperty({ example: 'password123', minLength: 8 })
    @IsString()
    @MinLength(8)
    password: string;

    @ApiProperty({ enum: Role, default: Role.BUYER })
    @IsEnum(Role)
    @IsOptional()
    role?: Role;

    @ApiProperty({ example: 'My Shop', required: false })
    @IsString()
    @IsOptional()
    shopName?: string;
}
