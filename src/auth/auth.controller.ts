import { Controller, Post, Get, Body, HttpCode, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ThrottlerGuard } from '@nestjs/throttler';
import { UsersService } from '../users/users.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly usersService: UsersService,
    ) { }

    @Post('register')
    @ApiOperation({ summary: 'Register a new user' })
    @ApiResponse({ status: 201, description: 'User successfully registered.' })
    @ApiResponse({ status: 400, description: 'Bad Request.' })
    async register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'User login' })
    @ApiResponse({ status: 200, description: 'User successfully logged in.' })
    @ApiResponse({ status: 401, description: 'Unauthorized.' })
    async login(@Body() dto: LoginDto) {
        return this.authService.login(dto);
    }

    @Get('profile')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get current user profile' })
    @ApiResponse({ status: 200, description: 'Current user profile.' })
    @ApiResponse({ status: 401, description: 'Unauthorized.' })
    async getProfile(@CurrentUser('id') userId: string) {
        return this.usersService.findById(userId);
    }

    @Post('forgot-password')
    @UseGuards(ThrottlerGuard)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Request password reset OTP' })
    @ApiResponse({ status: 200, description: 'OTP sent if email exists.' })
    @ApiResponse({ status: 429, description: 'Too many requests.' })
    async forgotPassword(@Body() dto: ForgotPasswordDto) {
        return this.authService.forgotPassword(dto);
    }

    @Post('verify-otp')
    @UseGuards(ThrottlerGuard)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Verify OTP code' })
    @ApiResponse({ status: 200, description: 'OTP verified successfully.' })
    @ApiResponse({ status: 401, description: 'Invalid or expired OTP.' })
    async verifyOtp(@Body() dto: VerifyOtpDto) {
        return this.authService.verifyOtp(dto);
    }

    @Post('reset-password')
    @UseGuards(ThrottlerGuard)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Reset password using OTP' })
    @ApiResponse({ status: 200, description: 'Password reset successfully.' })
    @ApiResponse({ status: 401, description: 'Invalid or expired OTP.' })
    async resetPassword(@Body() dto: ResetPasswordDto) {
        return this.authService.resetPassword(dto);
    }
}
