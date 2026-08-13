import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateReportDto, SearchUsersDto, UpdateMeDto } from './users.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return this.usersService.getMe(request.user.id);
  }

  @Patch('me')
  updateMe(@Req() request: AuthenticatedRequest, @Body() dto: UpdateMeDto) {
    return this.usersService.updateMe(request.user.id, dto);
  }

  @Delete('me')
  deleteMe(@Req() request: AuthenticatedRequest) {
    return this.usersService.deleteAccount(request.user.id);
  }

  @Get('me/blocked')
  blocked(@Req() request: AuthenticatedRequest) {
    return this.usersService.listBlocked(request.user.id);
  }

  @Post('reports')
  report(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateReportDto,
  ) {
    return this.usersService.report(request.user.id, dto);
  }

  @Post(':id/block')
  block(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.usersService.block(request.user.id, id);
  }

  @Delete(':id/block')
  unblock(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.usersService.unblock(request.user.id, id);
  }

  @Get('search')
  search(@Req() request: AuthenticatedRequest, @Query() query: SearchUsersDto) {
    return this.usersService.searchByUsername(request.user.id, query.username);
  }
}
