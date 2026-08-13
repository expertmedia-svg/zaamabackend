import { Body, Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/auth-user';
import { UploadRequestDto } from './uploads.dto';
import { UploadsService } from './uploads.service';

@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  createUpload(@Req() request: AuthenticatedRequest, @Body() dto: UploadRequestDto) {
    return this.uploadsService.createUpload(request.user.id, dto);
  }

  @Post(':id/complete')
  complete(@Req() request: AuthenticatedRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.uploadsService.complete(request.user.id, id);
  }
}
