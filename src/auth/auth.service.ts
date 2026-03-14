import {
    Injectable,
    ConflictException,
    UnauthorizedException,
    ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { generateUuidV7, bufferToUuid } from '../common/helpers/uuid.helper';
import { Role, UserStatus } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../redis/redis.service';

const OTP_TTL_SECONDS = 10 * 60; // 10 minutes
const OTP_KEY_PREFIX = 'otp:';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private mailService: MailService,
        private redisService: RedisService,
    ) { }

    async register(dto: RegisterDto) {
        // Check uniqueness
        const exists = await this.prisma.user.findFirst({
            where: {
                OR: [{ email: dto.email }, { username: dto.username }],
            },
        });
        if (exists) {
            throw new ConflictException('Email or username already taken');
        }

        const passwordHash = await bcrypt.hash(dto.password, 12);
        const id = generateUuidV7();
        const role = dto.role ?? Role.BUYER;

        const user = await this.prisma.user.create({
            data: {
                id,
                username: dto.username,
                email: dto.email,
                passwordHash,
                role,
                // Create profile based on role
                ...(role === Role.BUYER
                    ? { buyerProfile: { create: {} } }
                    : role === Role.SELLER
                        ? {
                            sellerProfile: {
                                create: {
                                    shopName: dto.shopName || `${dto.username}'s Shop`,
                                },
                            },
                        }
                        : {}),
            },
            include: {
                buyerProfile: true,
                sellerProfile: true,
            },
        });

        return {
            id: bufferToUuid(user.id),
            username: user.username,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt,
            profile: role === Role.BUYER ? user.buyerProfile : user.sellerProfile,
        };
    }

    async login(dto: LoginDto) {
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });

        if (!user || user.isDeleted) {
            throw new UnauthorizedException('Invalid credentials');
        }

        // Check if user is banned
        if (user.status === UserStatus.BANNED) {
            throw new ForbiddenException('Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.');
        }

        const valid = await bcrypt.compare(dto.password, user.passwordHash);
        if (!valid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const userId = bufferToUuid(user.id);
        const payload = { sub: userId, email: user.email, role: user.role };
        const accessToken = this.jwtService.sign(payload);

        return {
            accessToken,
            user: {
                id: userId,
                username: user.username,
                email: user.email,
                role: user.role,
            },
        };
    }

    // ─── Password Reset via OTP (Redis) ─────────────────────────────────────────

    async forgotPassword(dto: ForgotPasswordDto) {
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email }
        });

        if (!user || user.isDeleted || user.status === UserStatus.BANNED) {
            // Silently succeed to prevent email enumeration
            return { message: 'Nếu email tồn tại, một mã OTP sẽ được gửi đến bạn.' };
        }

        // Generate 6-digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otpCode, 10);

        // Store OTP in Redis with TTL (auto-delete after 10 minutes)
        await this.redisService.set(
            `${OTP_KEY_PREFIX}${dto.email}`,
            otpHash,
            OTP_TTL_SECONDS,
        );

        await this.mailService.sendMail({
            to: dto.email,
            subject: 'Mã xác thực OTP - Quên mật khẩu',
            template: 'otp',
            context: {
                name: user.username,
                otpCode,
                title: 'Mã xác thực của bạn'
            }
        });

        return { message: 'Nếu email tồn tại, một mã OTP sẽ được gửi đến bạn.' };
    }

    async verifyOtp(dto: VerifyOtpDto) {
        const otpHash = await this.redisService.get(`${OTP_KEY_PREFIX}${dto.email}`);

        if (!otpHash) {
            throw new UnauthorizedException('OTP không hợp lệ hoặc đã hết hạn.');
        }

        const valid = await bcrypt.compare(dto.otpCode, otpHash);
        if (!valid) {
            throw new UnauthorizedException('OTP không hợp lệ.');
        }

        return { message: 'Mã OTP hợp lệ.' };
    }

    async resetPassword(dto: ResetPasswordDto) {
        // Verify OTP first
        await this.verifyOtp({ email: dto.email, otpCode: dto.otpCode });

        const passwordHash = await bcrypt.hash(dto.newPassword, 12);

        await this.prisma.user.update({
            where: { email: dto.email },
            data: { passwordHash }
        });

        // Delete OTP from Redis after successful password reset
        await this.redisService.del(`${OTP_KEY_PREFIX}${dto.email}`);

        return { message: 'Mật khẩu đã được đặt lại thành công.' };
    }
}
