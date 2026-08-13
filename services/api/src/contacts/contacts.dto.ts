import { ArrayMaxSize, IsArray, Matches } from 'class-validator';

export class SyncContactsDto {
  @IsArray()
  @ArrayMaxSize(2000)
  @Matches(/^\+[1-9]\d{7,14}$/, { each: true })
  phones!: string[];
}
