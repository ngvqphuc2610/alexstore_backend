import { Controller, Get, Post, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
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
    @ApiOperation({ summary: 'Verifies VNPay return parameters for UI' })
    async verifyVNPay(@Query() query: any) {
        return this.paymentService.verifyVNPayReturn(query);
    }

    @Get('vnpay/ipn')
    @ApiOperation({ summary: 'Webhook/IPN for VNPay server-to-server call' })
    async vnpayIPN(@Query() query: any) {
        return this.paymentService.handleVNPayIPN(query);
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
    @ApiOperation({ summary: 'Verifies MoMo return parameters for UI' })
    async verifyMoMo(@Query() query: any) {
        return this.paymentService.verifyMoMoReturn(query);
    }

    @Post('momo/ipn') // MoMo sends POST request to IPN
    @ApiOperation({ summary: 'Webhook/IPN for MoMo server-to-server call' })
    async momoIPN(@Req() req: any) {
        return this.paymentService.handleMoMoIPN(req.body);
    }

    @Post('repay/:orderId')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Re-initiate payment for an existing pending order' })
    async repay(@Param('orderId') orderId: string, @Req() req: any) {
        const ipAddr = req.ip || 
            (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
            '127.0.0.1';

        return this.paymentService.repay(orderId, ipAddr);
    }
}
