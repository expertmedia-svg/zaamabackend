import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

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
