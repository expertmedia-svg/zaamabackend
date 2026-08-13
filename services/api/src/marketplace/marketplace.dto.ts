import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class MarketplaceQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsUUID()
  businessId?: string;
}

export class CreateBusinessDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(80)
  slug!: string;

  @IsString()
  @MaxLength(600)
  description!: string;

  @IsString()
  @MaxLength(80)
  category!: string;

  @IsString()
  @MaxLength(80)
  city!: string;
}

export class CreateProductDto {
  @IsString()
  @MaxLength(140)
  name!: string;

  @IsString()
  @MaxLength(1200)
  description!: string;

  @IsString()
  @MaxLength(80)
  category!: string;

  @IsInt()
  @Min(50)
  @Max(50_000_000)
  priceXof!: number;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  imageUrl?: string;
}

export class OrderLineDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;
}

export class CreateOrderDto {
  @IsString()
  @MaxLength(100)
  idempotencyKey!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  items!: OrderLineDto[];

  @IsString()
  @MaxLength(300)
  deliveryAddress!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerNote?: string;
}

export class UpdateOrderStatusDto {
  @IsString()
  @Matches(/^(ACCEPTED|PREPARING|READY|SHIPPED|DELIVERED|CANCELLED)$/)
  status!: 'ACCEPTED' | 'PREPARING' | 'READY' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
}
