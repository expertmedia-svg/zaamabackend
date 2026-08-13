import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/auth-user';
import { CreateStoryDto } from './stories.dto';
import { StoriesService } from './stories.service';

@UseGuards(JwtAuthGuard)
@Controller('stories')
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @Get('feed')
  feed(@Req() request: AuthenticatedRequest) {
    return this.storiesService.feed(request.user.id);
  }

  @Get('mine')
  mine(@Req() request: AuthenticatedRequest) {
    return this.storiesService.mine(request.user.id);
  }

  @Get(':id/viewers')
  viewers(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.storiesService.viewers(request.user.id, id);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateStoryDto) {
    return this.storiesService.create(request.user.id, dto);
  }

  @Post(':id/views')
  view(@Req() request: AuthenticatedRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.storiesService.view(request.user.id, id);
  }

  @Delete(':id')
  remove(@Req() request: AuthenticatedRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.storiesService.remove(request.user.id, id);
  }
}
