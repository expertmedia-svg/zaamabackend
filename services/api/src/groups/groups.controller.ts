import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/auth-user';
import { AddGroupMemberDto, CreateGroupDto, CreateGroupTopicDto, UpdateGroupDto } from './groups.dto';
import { GroupsService } from './groups.service';

@UseGuards(JwtAuthGuard)
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.groupsService.list(request.user.id);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateGroupDto) {
    return this.groupsService.create(request.user.id, dto);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groupsService.update(request.user.id, id, dto);
  }

  @Post(':id/members')
  addMember(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: AddGroupMemberDto,
  ) {
    return this.groupsService.addMember(request.user.id, id, dto.userId);
  }

  @Delete(':id/members/:userId')
  removeMember(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.groupsService.removeMember(request.user.id, id, userId);
  }

  @Post(':id/topics')
  createTopic(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreateGroupTopicDto,
  ) {
    return this.groupsService.createTopic(request.user.id, id, dto);
  }
}
