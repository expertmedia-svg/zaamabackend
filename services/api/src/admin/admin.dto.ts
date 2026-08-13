import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { ReportStatus } from '../generated/prisma/enums';

export class AdminLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class UpdateReportDto {
  @IsEnum(ReportStatus)
  status!: ReportStatus;
}
