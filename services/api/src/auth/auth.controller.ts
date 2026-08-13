import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticatedRequest } from '../common/auth-user';
import { AuthService } from './auth.service';
import { RequestOtpDto, RefreshDto, VerifyOtpDto } from './auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('request-otp')
  requestOtp(@Body() dto: RequestOtpDto) {
    this.logger.log(`Demande OTP reçue pour ${this.maskPhone(dto.phone)}`);
    return this.authService.requestOtp(dto.phone);
  }

  private maskPhone(phone: string): string {
    const normalized = phone.replace(/\D/g, '');
    return normalized.length > 4 ? `***${normalized.slice(-4)}` : '***';
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('verify-otp')
  verifyOtp(@Body() dto: VerifyOtpDto, @Req() request: AuthenticatedRequest) {
    return this.authService.verifyOtp(dto, request.ip, request.header('user-agent'));
  }

  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Req() request: AuthenticatedRequest) {
    return this.authService.logout(request.user.id, request.user.sessionId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  logoutAll(@Req() request: AuthenticatedRequest) {
    return this.authService.logoutAll(request.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  sessions(@Req() request: AuthenticatedRequest) {
    return this.authService.listSessions(request.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:id')
  revokeSession(@Req() request: AuthenticatedRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.authService.revokeSession(request.user.id, id);
  }
}
