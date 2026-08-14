import { MessageType, ReceiptState } from '../generated/prisma/enums';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsArray,
  ArrayMaxSize,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SendMessageDto {
  @IsUUID()
  conversationId!: string;

  @IsUUID()
  clientMessageId!: string;

  @IsEnum(MessageType)
  type: MessageType = MessageType.TEXT;

  @IsString()
  @MinLength(1)
  @MaxLength(1_800_000)
  encryptedPayload!: string;

  @IsOptional()
  @IsUUID()
  replyToId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  uploadIds?: string[];
}

export class UpdateMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1_800_000)
  encryptedPayload!: string;
}

export class ReactionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  emoji!: string;
}

export class ReceiptDto {
  @IsEnum(ReceiptState)
  state!: ReceiptState;
}

export class MessagePageQueryDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;
}
