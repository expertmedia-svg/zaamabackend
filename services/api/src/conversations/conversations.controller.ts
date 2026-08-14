import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessagePageQueryDto } from '../messages/messages.dto';
import { MessagesService } from '../messages/messages.service';
import { CreateDirectConversationDto, UpdateDisappearingMessagesDto } from './conversations.dto';
import { ConversationsService } from './conversations.service';

@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly messagesService: MessagesService,
  ) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.conversationsService.list(request.user.id);
  }

  @Post('direct')
  createDirect(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateDirectConversationDto,
  ) {
    return this.conversationsService.createDirect(request.user.id, dto.participantId);
  }

  @Get(':id')
  details(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.conversationsService.details(request.user.id, id);
  }

  @Patch(':id/disappearing-messages')
  updateDisappearingMessages(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateDisappearingMessagesDto,
  ) {
    return this.conversationsService.updateDisappearingMessages(
      request.user.id,
      id,
      dto.seconds,
    );
  }

  @Get(':id/messages')
  messages(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: MessagePageQueryDto,
  ) {
    return this.messagesService.list(request.user.id, id, query);
  }
}
