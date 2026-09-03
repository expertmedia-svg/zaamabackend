import { DevicePlatform } from '../generated/prisma/enums';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

const E164_PHONE = /^\+[1-9]\d{7,14}$/;

export class RequestOtpDto {
  @IsString()
  @Matches(E164_PHONE, { message: 'phone must use E.164 format, for example +22670000001' })
  phone!: string;
}

export class VerifyOtpDto extends RequestOtpDto {
  @IsString()
  @Length(4, 8)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  installationId!: string;

  @IsString()
  @MaxLength(120)
  deviceName!: string;

  @IsOptional()
  @IsEnum(DevicePlatform)
  platform: DevicePlatform = DevicePlatform.UNKNOWN;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

const PIN_PATTERN = /^\d{4,6}$/;

export class SetPinDto {
  @IsString()
  @Matches(PIN_PATTERN, { message: 'pin must be 4 to 6 digits' })
  pin!: string;
}

export class LoginPinDto extends RequestOtpDto {
  @IsString()
  @Matches(PIN_PATTERN, { message: 'pin must be 4 to 6 digits' })
  pin!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  installationId!: string;

  @IsString()
  @MaxLength(120)
  deviceName!: string;

  @IsOptional()
  @IsEnum(DevicePlatform)
  platform: DevicePlatform = DevicePlatform.UNKNOWN;
}
