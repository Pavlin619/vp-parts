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
import { CurrentUser, Public } from '../auth';
import type { AuthenticatedUser } from '../auth';
import { CartRequesterOf } from '../cart';
import type { CartRequester } from '../cart';
import {
  OrderReferenceParamsDto,
  PlaceOrderBodyDto,
  QuickOrderBodyDto,
} from './orders.dto';
import { OrdersService, PlacedOrder } from './orders.service';
import { PlaceOrderRateLimitGuard } from './place-order-rate-limit.guard';
import { QuickOrderRateLimitGuard } from './quick-order-rate-limit.guard';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  @UseGuards(PlaceOrderRateLimitGuard)
  async placeOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: PlaceOrderBodyDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PlaceOrderResponseDto> {
    return respond(response, await this.orders.placeOrder(user.clerkId, body));
  }

  /**
   * A guest's order, owned through the cart token rather than an account. A
   * signed-in customer's cart holds no token, so it answers 404 here.
   */
  @Post('quick')
  @Public()
  @Header('Cache-Control', 'no-store')
  @UseGuards(QuickOrderRateLimitGuard)
  async placeQuickOrder(
    @CartRequesterOf() requester: CartRequester,
    @Body() body: QuickOrderBodyDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PlaceOrderResponseDto> {
    return respond(
      response,
      await this.orders.placeQuickOrder(requester.token, body),
    );
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

/** 201 for a new order, 200 for a cart already ordered from — a retry. */
function respond(
  response: Response,
  { order, isReplay }: PlacedOrder,
): PlaceOrderResponseDto {
  if (isReplay) {
    response.status(HttpStatus.OK);
  }

  return order;
}
