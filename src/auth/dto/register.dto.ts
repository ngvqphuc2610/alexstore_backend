import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsEmail,
    IsString,
    MinLength,
    IsOptional,
    IsEnum,
} from 'class-validator';
import { Role } from '@prisma/client';

export class RegisterDto {
    @ApiProperty({ example: 'johndoe', description: 'The username of the user' })
    @IsString()
    username: string;

    @ApiProperty({ example: 'user@example.com', description: 'The email of the user' })
    @IsEmail()
    email: string;

    @ApiProperty({ example: 'password123', description: 'The password (min 8 characters)', minLength: 8 })
    @IsString()
    @MinLength(8)
    password: string;

    @ApiPropertyOptional({ enum: Role, default: Role.BUYER })
    @IsOptional()
    @IsEnum(Role)
    role?: Role;
}
