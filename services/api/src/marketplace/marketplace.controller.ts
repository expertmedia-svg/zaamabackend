import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/auth-user';
import {
  CreateBusinessDto,
  CreateOrderDto,
  CreateProductDto,
  MarketplaceQueryDto,
  UpdateOrderStatusDto,
} from './marketplace.dto';
import { MarketplaceService } from './marketplace.service';

@UseGuards(JwtAuthGuard)
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get('businesses')
  businesses(@Query() query: MarketplaceQueryDto) {
    return this.marketplace.businesses(query);
  }

  @Get('products')
  products(@Query() query: MarketplaceQueryDto) {
    return this.marketplace.products(query);
  }

  @Post('businesses')
  createBusiness(@Req() request: AuthenticatedRequest, @Body() dto: CreateBusinessDto) {
    return this.marketplace.createBusiness(request.user.id, dto);
  }

  @Post('products')
  createProduct(@Req() request: AuthenticatedRequest, @Body() dto: CreateProductDto) {
    return this.marketplace.createProduct(request.user.id, dto);
  }

  @Get('orders')
  orders(@Req() request: AuthenticatedRequest) {
    return this.marketplace.orders(request.user.id);
  }

  @Post('orders')
  createOrder(@Req() request: AuthenticatedRequest, @Body() dto: CreateOrderDto) {
    return this.marketplace.createOrder(request.user.id, dto);
  }

  @Patch('orders/:id/status')
  updateOrderStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.marketplace.updateOrderStatus(request.user.id, id, dto);
  }
}
