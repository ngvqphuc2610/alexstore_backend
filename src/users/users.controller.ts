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
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    // ─── Administrative Endpoints ─────────────────────────────────────────────

    @Get()
    @Roles(Role.ADMIN)
    @UseGuards(RolesGuard)
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
    @Roles(Role.ADMIN)
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Create a new user (Admin only)' })
    async create(@Body() dto: CreateUserDto) {
        return this.usersService.create(dto);
    }

    @Patch(':id')
    @Roles(Role.ADMIN)
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Update a user by ID (Admin only)' })
    async updateById(
        @Param('id') id: string,
        @Body() dto: UpdateUserDto,
    ) {
        return this.usersService.update(id, dto);
    }

    @Delete(':id')
    @Roles(Role.ADMIN)
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Deactivate a user by ID (Admin only)' })
    async deleteById(@Param('id') id: string) {
        return this.usersService.softDelete(id);
    }

    // ─── Ban / Unban ──────────────────────────────────────────────────────────

    @Patch(':id/ban')
    @Roles(Role.ADMIN)
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Ban a user (Admin only)' })
    async banUser(@Param('id') id: string) {
        return this.usersService.banUser(id);
    }

    @Patch(':id/unban')
    @Roles(Role.ADMIN)
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Unban a user (Admin only)' })
    async unbanUser(@Param('id') id: string) {
        return this.usersService.unbanUser(id);
    }

    // ─── Seller Verification ──────────────────────────────────────────────────

    @Patch(':id/approve-seller')
    @Roles(Role.ADMIN)
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Approve a seller (Admin only)' })
    async approveSeller(@Param('id') id: string) {
        return this.usersService.approveSeller(id);
    }

    @Patch(':id/reject-seller')
    @Roles(Role.ADMIN)
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Reject a seller (Admin only)' })
    async rejectSeller(@Param('id') id: string) {
        return this.usersService.rejectSeller(id);
    }

    // ─── Seller Registration (Buyer → Seller) ────────────────────────────────

    @Post('seller/register')
    @ApiOperation({ summary: 'Register as a seller (Buyer submits application)' })
    async registerSeller(
        @CurrentUser('id') userId: string,
        @Body() dto: RegisterSellerDto,
    ) {
        return this.usersService.registerSeller(userId, dto);
    }

    // ─── Profile Endpoints ────────────────────────────────────────────────────

    @Get('me')
    @ApiOperation({ summary: 'Get current user profile' })
    async getProfile(@CurrentUser('id') userId: string) {
        return this.usersService.findById(userId);
    }

    @Put('me')
    @ApiOperation({ summary: 'Update current user profile' })
    async updateProfile(
        @CurrentUser('id') userId: string,
        @Body() dto: UpdateUserDto,
    ) {
        return this.usersService.update(userId, dto);
    }

    @Delete('me')
    @ApiOperation({ summary: 'Deactivate current user account' })
    async deactivate(@CurrentUser('id') userId: string) {
        return this.usersService.softDelete(userId);
    }
}
