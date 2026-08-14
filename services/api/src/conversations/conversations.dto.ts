import { IsIn, IsInt, IsUUID } from 'class-validator';

export class CreateDirectConversationDto {
  @IsUUID()
  participantId!: string;
}

export class UpdateDisappearingMessagesDto {
  @IsInt()
  @IsIn([0, 86_400, 604_800, 7_776_000])
  seconds!: 0 | 86400 | 604800 | 7776000;
}
