import { Module } from '@nestjs/common';
import { WalletController, YengaPayWebhookController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { YengaPayService } from './yengapay.service';

@Module({
  controllers: [WalletController, YengaPayWebhookController],
  providers: [WalletService, YengaPayService],
  exports: [WalletService],
})
export class WalletModule {}
