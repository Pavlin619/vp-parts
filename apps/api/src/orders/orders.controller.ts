import {
  Body,
  Controller,
  Get,
  Header,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type {
  OrderDetailDto,
  PlaceOrderResponseDto,
} from '@vp-parts-shop/shared';
import { CurrentUser } from '../auth';
import type { AuthenticatedUser } from '../auth';
import { OrderReferenceParamsDto, PlaceOrderBodyDto } from './orders.dto';
import { OrdersService } from './orders.service';
import { PlaceOrderRateLimitGuard } from './place-order-rate-limit.guard';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** 201 for a new order, 200 for a cart already ordered from — a retry. */
  @Post()
  @Header('Cache-Control', 'no-store')
  @UseGuards(PlaceOrderRateLimitGuard)
  async placeOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: PlaceOrderBodyDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PlaceOrderResponseDto> {
    const { order, isReplay } = await this.orders.placeOrder(
      user.clerkId,
      body,
    );

    if (isReplay) {
      response.status(HttpStatus.OK);
    }

    return order;
  }

  @Get(':orderReference')
  @Header('Cache-Control', 'no-store')
  getOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { orderReference }: OrderReferenceParamsDto,
  ): Promise<OrderDetailDto> {
    return this.orders.getOrder(user.clerkId, orderReference);
  }
}
