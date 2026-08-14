import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/auth-user';
import { RegisterEncryptionKeyDto } from './encryption.dto';
import { EncryptionService } from './encryption.service';

@UseGuards(JwtAuthGuard)
@Controller('encryption')
export class EncryptionController {
  constructor(private readonly encryption: EncryptionService) {}

  @Post('devices/current')
  register(
    @Req() request: AuthenticatedRequest,
    @Body() dto: RegisterEncryptionKeyDto,
  ) {
    return this.encryption.register(request.user.deviceId, dto.publicKey);
  }

  @Get('conversations/:id/devices')
  devices(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.encryption.conversationDevices(request.user.id, id);
  }
}
