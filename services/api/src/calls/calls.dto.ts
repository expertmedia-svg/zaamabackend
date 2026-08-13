import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { CallStatus, CallType } from '../generated/prisma/enums';

export class CreateCallDto {
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsEnum(CallType)
  type: CallType = CallType.AUDIO;
}

export class UpdateCallDto {
  @IsEnum(CallStatus)
  status!: CallStatus;
}
