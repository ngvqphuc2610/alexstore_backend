import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
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
    @ApiOperation({ summary: 'Get reviews (by product or all for admin)' })
    @ApiQuery({ name: 'productId', required: false, type: String })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'search', required: false, type: String })
    @ApiQuery({ name: 'sortBy', required: false, type: String, description: 'newest | oldest | rating_high | rating_low' })
    @ApiResponse({ status: 200, description: 'Return reviews.' })
    findReviews(
        @Query('productId') productId?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('search') search?: string,
        @Query('sortBy') sortBy?: string,
    ) {
        // If productId is provided, return reviews for that product
        if (productId) {
            return this.reviewsService.findByProduct(
                productId,
                page ? Number(page) : 1,
                limit ? Number(limit) : 20,
            );
        }
        // Otherwise return all reviews (admin use case)
        return this.reviewsService.findAll(
            page ? Number(page) : 1,
            limit ? Number(limit) : 20,
            search,
            sortBy,
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

    @Delete(':id')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiOperation({ summary: 'Delete a review (Admin only)' })
    @ApiResponse({ status: 200, description: 'Review deleted.' })
    async deleteReview(@Param('id') id: string) {
        return this.reviewsService.deleteReview(Number(id));
    }
}
