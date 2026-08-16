import { forwardRef, Module } from '@nestjs/common';
import { MessagesModule } from '../messages/messages.module';
import { PresenceService } from './presence.service';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimePublisher } from './realtime.publisher';

@Module({
  imports: [forwardRef(() => MessagesModule)],
  providers: [RealtimeGateway, RealtimePublisher, PresenceService],
  exports: [RealtimePublisher, PresenceService],
})
export class RealtimeModule {}
