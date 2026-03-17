import {
    Controller,
    Get,
    Post,
    Put,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { RegisterSellerDto } from './dto/register-seller.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Users')
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    // ─── Public Endpoints (no auth required) ─────────────────────────────────

    @Get('seller-profile/:id')
    @ApiOperation({ summary: 'Get public seller profile (no auth required)' })
    async getSellerPublicProfile(@Param('id') id: string) {
        return this.usersService.getSellerPublicProfile(id);
    }

    // ─── Administrative Endpoints ─────────────────────────────────────────────

    @Get()
    @ApiBearerAuth()
    @Roles(Role.ADMIN)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @ApiOperation({ summary: 'List all users (Admin only)' })
    async findAll(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('role') role?: string,
        @Query('status') status?: string,
        @Query('keyword') keyword?: string,
    ) {
        return this.usersService.findAll(
            page ? Number(page) : 1,
            limit ? Number(limit) : 20,
            role,
            status,
            keyword,
        );
    }

    @Post()
    @ApiBearerAuth()
    @Roles(Role.ADMIN)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @ApiOperation({ summary: 'Create a new user (Admin only)' })
    async create(@Body() dto: CreateUserDto) {
        return this.usersService.create(dto);
    }

    @Patch(':id')
    @ApiBearerAuth()
    @Roles(Role.ADMIN)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @ApiOperation({ summary: 'Update a user by ID (Admin only)' })
    async updateById(
        @Param('id') id: string,
        @Body() dto: UpdateUserDto,
    ) {
        return this.usersService.update(id, dto);
    }

    @Delete(':id')
    @ApiBearerAuth()
    @Roles(Role.ADMIN)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @ApiOperation({ summary: 'Deactivate a user by ID (Admin only)' })
    async deleteById(@Param('id') id: string) {
        return this.usersService.softDelete(id);
    }

    // ─── Ban / Unban ──────────────────────────────────────────────────────────

    @Patch(':id/ban')
    @ApiBearerAuth()
    @Roles(Role.ADMIN)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @ApiOperation({ summary: 'Ban a user (Admin only)' })
    async banUser(@Param('id') id: string) {
        return this.usersService.banUser(id);
    }

    @Patch(':id/unban')
    @ApiBearerAuth()
    @Roles(Role.ADMIN)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @ApiOperation({ summary: 'Unban a user (Admin only)' })
    async unbanUser(@Param('id') id: string) {
        return this.usersService.unbanUser(id);
    }

    // ─── Seller Verification ──────────────────────────────────────────────────

    @Patch(':id/approve-seller')
    @ApiBearerAuth()
    @Roles(Role.ADMIN)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @ApiOperation({ summary: 'Approve a seller (Admin only)' })
    async approveSeller(@Param('id') id: string) {
        return this.usersService.approveSeller(id);
    }

    @Patch(':id/reject-seller')
    @ApiBearerAuth()
    @Roles(Role.ADMIN)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @ApiOperation({ summary: 'Reject a seller (Admin only)' })
    async rejectSeller(@Param('id') id: string) {
        return this.usersService.rejectSeller(id);
    }

    // ─── Pending Sellers (Admin) ────────────────────────────────────────────

    @Get('pending-sellers')
    @ApiBearerAuth()
    @Roles(Role.ADMIN)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @ApiOperation({ summary: 'List pending seller requests (Admin only)' })
    async getPendingSellers(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.usersService.findPendingSellers(
            page ? Number(page) : 1,
            limit ? Number(limit) : 20,
        );
    }

    // ─── Seller Registration (Buyer → Seller) ────────────────────────────────

    @Post('seller/register')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Register as a seller (Buyer submits application)' })
    async registerSeller(
        @CurrentUser('id') userId: string,
        @Body() dto: RegisterSellerDto,
    ) {
        return this.usersService.registerSeller(userId, dto);
    }

    // ─── Profile Endpoints ────────────────────────────────────────────────────

    @Get('me')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get current user profile' })
    async getProfile(@CurrentUser('id') userId: string) {
        return this.usersService.findById(userId);
    }

    @Put('me')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Update current user profile' })
    async updateProfile(
        @CurrentUser('id') userId: string,
        @Body() dto: UpdateUserDto,
    ) {
        return this.usersService.update(userId, dto);
    }

    @Delete('me')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Deactivate current user account' })
    async deactivate(@CurrentUser('id') userId: string) {
        return this.usersService.softDelete(userId);
    }
}
