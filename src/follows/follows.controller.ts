import { Controller, Post, Delete, Get, Param, UseGuards, Req } from '@nestjs/common';
import { FollowsService } from './follows.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('follows')
@UseGuards(JwtAuthGuard)
export class FollowsController {
    constructor(private readonly followsService: FollowsService) {}

    @Post(':sellerId')
    follow(@CurrentUser('id') buyerId: string, @Param('sellerId') sellerId: string) {
        return this.followsService.follow(buyerId, sellerId);
    }

    @Delete(':sellerId')
    unfollow(@CurrentUser('id') buyerId: string, @Param('sellerId') sellerId: string) {
        return this.followsService.unfollow(buyerId, sellerId);
    }

    @Get('me/following')
    getFollowing(@CurrentUser('id') buyerId: string) {
        return this.followsService.getFollowing(buyerId);
    }

    @Get('me/followers')
    getFollowers(@CurrentUser('id') buyerId: string) {
        return this.followsService.getFollowers(buyerId);
    }

    @Get('status/:sellerId')
    getStatus(@CurrentUser('id') buyerId: string, @Param('sellerId') sellerId: string) {
        return this.followsService.getStatus(buyerId, sellerId);
    }

    @Get('me/following-count')
    getFollowingCount(@CurrentUser('id') buyerId: string) {
        return this.followsService.getFollowingCount(buyerId);
    }

    @Get('me/follower-count')
    getFollowerCount(@CurrentUser('id') buyerId: string) {
        return this.followsService.getFollowerCount(buyerId);
    }
}
