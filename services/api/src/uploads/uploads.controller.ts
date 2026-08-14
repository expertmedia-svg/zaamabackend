import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/auth-user';
import { UploadRequestDto } from './uploads.dto';
import { UploadsService } from './uploads.service';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  createUpload(@Req() request: AuthenticatedRequest, @Body() dto: UploadRequestDto) {
    return this.uploadsService.createUpload(request.user.id, dto);
  }

  @Post(':id/complete')
  @UseGuards(JwtAuthGuard)
  complete(@Req() request: AuthenticatedRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.uploadsService.complete(request.user.id, id);
  }

  @Get(':id/download')
  @UseGuards(JwtAuthGuard)
  download(@Req() request: AuthenticatedRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.uploadsService.createDownload(request.user.id, id);
  }

  @Put('direct/:token')
  async directUpload(
    @Param('token') token: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const rawLength = request.headers['content-length'];
    await this.uploadsService.acceptDirectUpload({
      token,
      body: request,
      contentType: request.headers['content-type'],
      contentLength: typeof rawLength === 'string' ? Number(rawLength) : undefined,
    });
    response.status(204).end();
  }

  @Get('direct/:token')
  @Header('Cache-Control', 'private, max-age=300')
  async directDownload(@Param('token') token: string, @Res() response: Response) {
    const media = await this.uploadsService.openDirectDownload(token);
    response.setHeader('Content-Type', media.contentType);
    response.setHeader('Content-Length', media.size);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    media.body.on('error', () => response.destroy());
    media.body.pipe(response);
  }
}
