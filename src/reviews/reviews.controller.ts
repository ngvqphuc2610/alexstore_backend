import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/review.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
    constructor(private readonly reviewsService: ReviewsService) { }

    @Get()
    @ApiOperation({ summary: 'Get reviews for a product' })
    @ApiQuery({ name: 'productId', required: true, type: String })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiResponse({ status: 200, description: 'Return reviews for the product.' })
    findByProduct(
        @Query('productId') productId: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.reviewsService.findByProduct(
            productId,
            page ? Number(page) : 1,
            limit ? Number(limit) : 20,
        );
    }

    @Post()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.BUYER)
    @ApiOperation({ summary: 'Submit a product review' })
    @ApiResponse({ status: 201, description: 'Review successfully submitted.' })
    @ApiResponse({ status: 400, description: 'Bad Request.' })
    @ApiResponse({ status: 401, description: 'Unauthorized.' })
    submit(
        @CurrentUser('id') userId: string,
        @Body() dto: CreateReviewDto,
    ) {
        return this.reviewsService.submitReview(userId, dto);
    }
}
