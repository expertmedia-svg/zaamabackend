import { Body, Controller, Get, Patch, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SearchUsersDto, UpdateMeDto } from './users.dto';
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

  @Get('search')
  search(@Req() request: AuthenticatedRequest, @Query() query: SearchUsersDto) {
    return this.usersService.searchByUsername(request.user.id, query.username);
  }
}
