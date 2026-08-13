import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class UploadRequestDto {
  @IsString()
  @MaxLength(255)
  @Matches(/^[^\\/]+$/)
  fileName!: string;

  @IsString()
  @MaxLength(128)
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(1_073_741_824)
  size!: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  checksum?: string;
}
