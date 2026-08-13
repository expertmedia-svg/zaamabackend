import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  IsBoolean,
  IsEnum,
  IsInt,
  Max,
  Min,
} from 'class-validator';

export enum GroupVisibilityDto {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE',
}

export enum GroupJoinModeDto {
  OPEN = 'OPEN',
  APPROVAL = 'APPROVAL',
  INVITE_ONLY = 'INVITE_ONLY',
}

export class CreateGroupDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(255)
  @IsUUID(undefined, { each: true })
  members: string[] = [];
}

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  avatarUrl?: string;

  @IsOptional()
  @IsEnum(GroupVisibilityDto)
  visibility?: GroupVisibilityDto;

  @IsOptional()
  @IsEnum(GroupJoinModeDto)
  joinMode?: GroupJoinModeDto;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3600)
  slowModeSeconds?: number;

  @IsOptional()
  @IsBoolean()
  membersCanPost?: boolean;
}

export class AddGroupMemberDto {
  @IsUUID()
  userId!: string;
}

export class CreateGroupTopicDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  icon?: string;
}
