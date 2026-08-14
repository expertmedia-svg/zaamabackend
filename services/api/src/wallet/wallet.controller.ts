import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/auth-user';
import { PayOrderDto, TopUpWalletDto, TransferWalletDto } from './wallet.dto';
import { WalletService } from './wallet.service';
import { YengaPayService } from './yengapay.service';

@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  overview(@Req() request: AuthenticatedRequest) {
    return this.wallet.overview(request.user.id);
  }

  @Post('top-ups')
  topUp(@Req() request: AuthenticatedRequest, @Body() dto: TopUpWalletDto) {
    return this.wallet.topUp(request.user.id, dto);
  }

  @Post('top-ups/:id/refresh')
  refreshTopUp(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.wallet.refreshTopUp(request.user.id, id);
  }

  @Post('transfers')
  transfer(@Req() request: AuthenticatedRequest, @Body() dto: TransferWalletDto) {
    return this.wallet.transfer(request.user.id, dto);
  }

  @Post('orders/:id/pay')
  payOrder(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: PayOrderDto,
  ) {
    return this.wallet.payMarketplaceOrder(request.user.id, id, dto.idempotencyKey);
  }
}

@Controller('webhooks/yengapay')
export class YengaPayWebhookController {
  constructor(
    private readonly wallet: WalletService,
    private readonly yengaPay: YengaPayService,
  ) {}

  @Post()
  handle(
    @Body() payload: Record<string, unknown>,
    @Headers('x-webhook-hash') signature?: string,
  ) {
    this.yengaPay.verifyWebhook(payload, signature);
    return this.wallet.handleYengaPayWebhook(this.yengaPay.parseWebhook(payload));
  }
}
