import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEmail, IsOptional } from 'class-validator';

export class UpdateUserDto {
    @ApiPropertyOptional({ example: 'johndoe', description: 'Update the username' })
    @IsOptional()
    @IsString()
    username?: string;

    @ApiPropertyOptional({ example: 'user@example.com', description: 'Update the email' })
    @IsOptional()
    @IsEmail()
    email?: string;
}
