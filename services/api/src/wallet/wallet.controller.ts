import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/auth-user';
import { PayOrderDto, TopUpWalletDto, TransferWalletDto } from './wallet.dto';
import { WalletService } from './wallet.service';

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
