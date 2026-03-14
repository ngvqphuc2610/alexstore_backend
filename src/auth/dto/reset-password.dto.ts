import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: '123456', description: '6-digit OTP code' })
  @IsString()
  @MinLength(6)
  otpCode: string;

  @ApiProperty({ example: 'newPassword123!', description: 'New password (min 6 chars)' })
  @IsString()
  @MinLength(6)
  newPassword: string;
}
