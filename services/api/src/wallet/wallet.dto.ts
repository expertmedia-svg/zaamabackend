import { IsEnum, IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export enum WalletProviderDto {
  SANDBOX = 'SANDBOX',
  ORANGE_MONEY = 'ORANGE_MONEY',
  MOOV_MONEY = 'MOOV_MONEY',
}

export class TopUpWalletDto {
  @IsInt()
  @Min(100)
  @Max(2_000_000)
  amountXof!: number;

  @IsEnum(WalletProviderDto)
  provider!: WalletProviderDto;

  @IsString()
  @Matches(/^\+226\d{8}$/)
  phone!: string;

  @IsString()
  @MaxLength(100)
  idempotencyKey!: string;
}

export class TransferWalletDto {
  @IsUUID()
  recipientUserId!: string;

  @IsInt()
  @Min(100)
  @Max(2_000_000)
  amountXof!: number;

  @IsString()
  @MaxLength(120)
  label!: string;

  @IsString()
  @MaxLength(100)
  idempotencyKey!: string;
}

export class PayOrderDto {
  @IsString()
  @MaxLength(100)
  idempotencyKey!: string;
}
