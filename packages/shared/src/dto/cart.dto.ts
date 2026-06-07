export interface CartItemDto {
  articleNumber: string;
  brandName: string;
  description: string;
  thumbnailUrl: string | null;
  quantity: number;
  unitPriceExVat: number;
  unitPriceIncVat: number;
  lineTotalIncVat: number;
  available: boolean;
}

export interface CartDto {
  id: string;
  items: CartItemDto[];
  subtotalExVat: number;
  vatAmount: number;
  totalIncVat: number;
  itemCount: number;
}

export interface AddCartItemRequestDto {
  articleNumber: string;
  quantity: number;
}

export interface UpdateCartItemRequestDto {
  quantity: number;
}

export interface CartValidationChangedItemDto {
  articleNumber: string;
  oldPriceIncVat: number;
  newPriceIncVat: number;
  difference: number;
}

export interface CartValidationUnavailableItemDto {
  articleNumber: string;
  description: string;
}

export interface CartValidationResponseDto {
  valid: boolean;
  changedItems: CartValidationChangedItemDto[];
  unavailableItems: CartValidationUnavailableItemDto[];
}

export interface SaveCartRequestDto {
  name: string;
}

export interface SaveCartResponseDto {
  savedCartId: string;
  name: string;
}

export interface SavedCartDto {
  id: string;
  name: string;
  itemCount: number;
  updatedAt: string;
}
