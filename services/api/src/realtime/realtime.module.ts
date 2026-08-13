import { forwardRef, Module } from '@nestjs/common';
import { MessagesModule } from '../messages/messages.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimePublisher } from './realtime.publisher';

@Module({
  imports: [forwardRef(() => MessagesModule)],
  providers: [RealtimeGateway, RealtimePublisher],
  exports: [RealtimePublisher],
})
export class RealtimeModule {}
