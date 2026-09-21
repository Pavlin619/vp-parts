import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CART_TOKEN_HEADER } from '@vp-parts-shop/shared';
import type { CartAdoptResponseDto, CartDto } from '@vp-parts-shop/shared';
import { Public } from '../auth';
import { CartRequesterOf } from './cart-requester';
import type { CartRequester } from './cart-requester';
import {
  AddCartLineDto,
  ArticleIdentityParamsDto,
  SetCartSelectionDto,
  UpdateCartLineDto,
} from './cart.dto';
import { CartService } from './cart.service';
import type { CartMutationResult } from './cart.service';

/**
 * Every route is public because a guest has a cart too. The owner comes from
 * the request itself — a Clerk identity if there is one, otherwise the cart
 * token — so "public" here means "no account required", not "unscoped".
 */
@Public()
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  /**
   * Never cached: this is the one response a customer expects to reflect the
   * last thing they clicked, on whatever device they clicked it. The mutations
   * below need no such header — nothing caches a POST.
   */
  @Get()
  @Header('Cache-Control', 'no-store')
  getCart(@CartRequesterOf() requester: CartRequester): Promise<CartDto> {
    return this.cart.getCart(requester);
  }

  @Post('items')
  async addLine(
    @CartRequesterOf() requester: CartRequester,
    @Body() dto: AddCartLineDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartDto> {
    return this.respond(response, await this.cart.addLine(requester, dto));
  }

  @Patch('items/:brandId/:articleNumber')
  updateLine(
    @CartRequesterOf() requester: CartRequester,
    @Param() article: ArticleIdentityParamsDto,
    @Body() dto: UpdateCartLineDto,
  ): Promise<CartDto> {
    return this.cart.updateLine(requester, article, dto);
  }

  @Delete('items/:brandId/:articleNumber')
  removeLine(
    @CartRequesterOf() requester: CartRequester,
    @Param() article: ArticleIdentityParamsDto,
  ): Promise<CartDto> {
    return this.cart.removeLine(requester, article);
  }

  @Post('selection')
  @HttpCode(HttpStatus.OK)
  setAllSelected(
    @CartRequesterOf() requester: CartRequester,
    @Body() dto: SetCartSelectionDto,
  ): Promise<CartDto> {
    return this.cart.setAllSelected(requester, dto.isSelected);
  }

  @Delete()
  clear(@CartRequesterOf() requester: CartRequester): Promise<CartDto> {
    return this.cart.clear(requester);
  }

  /**
   * Called once, at sign-in, to unite the cart a visitor filled anonymously
   * with the one their account already held.
   */
  @Post('adopt')
  @HttpCode(HttpStatus.OK)
  adopt(
    @CartRequesterOf() requester: CartRequester,
  ): Promise<CartAdoptResponseDto> {
    return this.cart.adopt(requester);
  }

  /**
   * Hands back a token the call just minted. In a header rather than the body
   * because response bodies are logged and a cart token is a bearer credential
   * for one cart.
   */
  private respond(
    response: Response,
    { cart, mintedToken }: CartMutationResult,
  ): CartDto {
    if (mintedToken) {
      response.setHeader(CART_TOKEN_HEADER, mintedToken);
    }

    return cart;
  }
}
