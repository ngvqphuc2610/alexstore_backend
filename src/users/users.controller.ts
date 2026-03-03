import {
    Controller,
    Get,
    Put,
    Delete,
    Body,
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get('me')
    @ApiOperation({ summary: 'Get current user profile' })
    @ApiResponse({ status: 200, description: 'Return the current user profile.' })
    @ApiResponse({ status: 401, description: 'Unauthorized.' })
    async getProfile(@CurrentUser('id') userId: string) {
        return this.usersService.findById(userId);
    }

    @Put('me')
    @ApiOperation({ summary: 'Update current user profile' })
    @ApiResponse({ status: 200, description: 'Profile successfully updated.' })
    @ApiResponse({ status: 400, description: 'Bad Request.' })
    @ApiResponse({ status: 401, description: 'Unauthorized.' })
    async updateProfile(
        @CurrentUser('id') userId: string,
        @Body() dto: UpdateUserDto,
    ) {
        return this.usersService.update(userId, dto);
    }

    @Delete('me')
    @ApiOperation({ summary: 'Deactivate current user account' })
    @ApiResponse({ status: 200, description: 'Account successfully deactivated.' })
    @ApiResponse({ status: 401, description: 'Unauthorized.' })
    async deactivate(@CurrentUser('id') userId: string) {
        return this.usersService.softDelete(userId);
    }
}
