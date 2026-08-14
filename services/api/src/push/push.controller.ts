import { Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/auth-user';
import { RegisterPushTokenDto } from './push.dto';
import { PushService } from './push.service';

@UseGuards(JwtAuthGuard)
@Controller('push-tokens')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Post()
  register(
    @Req() request: AuthenticatedRequest,
    @Body() dto: RegisterPushTokenDto,
  ) {
    return this.push.register(request.user.id, request.user.deviceId, dto.token);
  }

  @Delete()
  unregister(@Req() request: AuthenticatedRequest) {
    return this.push.unregister(request.user.id, request.user.deviceId);
  }
}
