import {
    IsEmail,
    IsString,
    MinLength,
    IsOptional,
    IsEnum,
} from 'class-validator';
import { Role } from '@prisma/client';

export class RegisterDto {
    @IsString()
    username: string;

    @IsEmail()
    email: string;

    @IsString()
    @MinLength(8)
    password: string;

    @IsOptional()
    @IsEnum(Role)
    role?: Role;
}
