import { Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Payment')
@Controller('payment')
export class PaymentController {
    constructor(private readonly paymentService: PaymentService) { }

    // =========================================================================
    // VNPAY
    // =========================================================================

    @Get('vnpay/create-url/:orderId')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Creates VNPay payment URL for an order' })
    async createVNPayUrl(@Param('orderId') orderId: string, @Req() req: any) {
        // Simple way to get IP address
        const ipAddr = req.headers['x-forwarded-for'] ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            req.connection.socket.remoteAddress || '127.0.0.1';

        const url = await this.paymentService.createVNPayUrl(orderId, ipAddr);
        return { url };
    }

    @Get('vnpay/verify')
    @ApiOperation({ summary: 'Verifies VNPay return parameters' })
    async verifyVNPay(@Query() query: any) {
        return this.paymentService.verifyVNPayReturn(query);
    }

    // =========================================================================
    // MOMO
    // =========================================================================

    @Get('momo/create-url/:orderId')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Creates MoMo payment URL for an order' })
    async createMoMoUrl(@Param('orderId') orderId: string) {
        const url = await this.paymentService.createMoMoUrl(orderId);
        return { url };
    }

    @Get('momo/verify')
    @ApiOperation({ summary: 'Verifies MoMo return parameters' })
    async verifyMoMo(@Query() query: any) {
        return this.paymentService.verifyMoMoReturn(query);
    }
}
