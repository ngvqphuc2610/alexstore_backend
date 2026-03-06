import {
    Controller,
    Get,
    Post,
    Patch,
    Param,
    Body,
    UseGuards,
    ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SupportService } from './support.service';
import { CreateSupportRequestDto, AdminReplyDto } from './dto/support.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Support')
@ApiBearerAuth()
@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
    constructor(private readonly supportService: SupportService) { }

    @Post()
    @ApiOperation({ summary: 'Submit a support request' })
    create(
        @CurrentUser('id') userId: string,
        @Body() dto: CreateSupportRequestDto,
    ) {
        return this.supportService.create(userId, dto);
    }

    @Get('me')
    @ApiOperation({ summary: 'Get current user requests' })
    findMyRequests(@CurrentUser('id') userId: string) {
        return this.supportService.findAllForUser(userId);
    }

    @Get('admin/all')
    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Get all requests (Admin only)' })
    findAllAdmin() {
        return this.supportService.findAllForAdmin();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get request detail' })
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.supportService.findOne(id);
    }

    @Patch(':id/reply')
    @UseGuards(RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Reply to a support request (Admin only)' })
    reply(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: AdminReplyDto,
    ) {
        return this.supportService.reply(id, dto);
    }
}
