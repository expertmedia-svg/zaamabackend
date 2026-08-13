import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MessageType, StoryPrivacy } from '../generated/prisma/enums';

export class CreateStoryItemDto {
  @IsEnum(MessageType)
  type!: MessageType;

  @IsString()
  @MaxLength(1_800_000)
  encryptedPayload!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60_000)
  durationMs?: number;
}

export class CreateStoryDto {
  @IsEnum(StoryPrivacy)
  privacy: StoryPrivacy = StoryPrivacy.CONTACTS;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID(undefined, { each: true })
  audienceUserIds: string[] = [];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID(undefined, { each: true })
  excludedUserIds: string[] = [];

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateStoryItemDto)
  items!: CreateStoryItemDto[];
}
