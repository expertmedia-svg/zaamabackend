import { IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterEncryptionKeyDto {
  @IsString()
  @MinLength(44)
  @MaxLength(44)
  publicKey!: string;
}
