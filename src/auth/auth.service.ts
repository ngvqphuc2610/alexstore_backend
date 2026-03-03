import {
    Injectable,
    ConflictException,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { generateUuidV7, bufferToUuid } from '../common/helpers/uuid.helper';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
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
}
