import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/auth-user';
import { SyncContactsDto } from './contacts.dto';
import { ContactsService } from './contacts.service';

@UseGuards(JwtAuthGuard)
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post('sync')
  sync(@Req() request: AuthenticatedRequest, @Body() dto: SyncContactsDto) {
    return this.contactsService.sync(request.user.id, dto.phones);
  }

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.contactsService.list(request.user.id);
  }
}
