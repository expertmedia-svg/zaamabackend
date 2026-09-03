import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/auth-user';
import { CallsService } from './calls.service';
import { CreateCallDto, UpdateCallDto } from './calls.dto';

@UseGuards(JwtAuthGuard)
@Controller('calls')
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.callsService.list(request.user.id);
  }

  @Get('ice-servers')
  iceServers(@Req() request: AuthenticatedRequest) {
    return this.callsService.getIceServers(request.user.id);
  }

  @Get(':id')
  details(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.callsService.details(request.user.id, id);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateCallDto) {
    return this.callsService.create(request.user.id, dto);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateCallDto,
  ) {
    return this.callsService.update(request.user.id, id, dto.status);
  }

  @Post(':id/leave')
  leave(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.callsService.leave(request.user.id, id);
  }
}
