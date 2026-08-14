import { Body, Controller, Delete, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessagesService } from './messages.service';
import { ReactionDto, ReceiptDto, SendMessageDto, UpdateMessageDto } from './messages.dto';

@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  send(@Req() request: AuthenticatedRequest, @Body() dto: SendMessageDto) {
    return this.messagesService.send(request.user.id, dto, request.user.deviceId);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateMessageDto,
  ) {
    return this.messagesService.update(request.user.id, id, dto.encryptedPayload);
  }

  @Delete(':id')
  remove(@Req() request: AuthenticatedRequest, @Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.messagesService.removeForEveryone(request.user.id, id);
  }

  @Post(':id/reactions')
  react(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ReactionDto,
  ) {
    return this.messagesService.react(request.user.id, id, dto.emoji);
  }

  @Delete(':id/reactions/:emoji')
  removeReaction(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('emoji') emoji: string,
  ) {
    return this.messagesService.removeReaction(request.user.id, id, emoji);
  }

  @Post(':id/receipt')
  receipt(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ReceiptDto,
  ) {
    return this.messagesService.updateReceipt(request.user.id, id, dto.state);
  }
}
