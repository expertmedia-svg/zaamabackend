import { IsBoolean, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]{3,30}$/)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  avatar?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  language?: string;

  @IsOptional()
  @IsString()
  theme?: string;

  @IsOptional()
  @IsBoolean()
  readReceipts?: boolean;
}

export class SearchUsersDto {
  @IsString()
  @Matches(/^@?[a-z0-9_]{2,30}$/)
  username!: string;
}

export class CreateReportDto {
  @IsOptional()
  @IsUUID()
  targetUserId?: string;

  @IsOptional()
  @IsUUID()
  messageId?: string;

  @IsOptional()
  @IsUUID()
  storyId?: string;

  @IsString()
  @MaxLength(120)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  evidenceCiphertext?: string;
}
