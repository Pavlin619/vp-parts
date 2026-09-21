interface AddToCartLabelState {
  isAdding: boolean;
  canAdd: boolean;
  addingLabel: string;
  readyLabel: string;
  fullLabel: string;
}

/**
 * The aria-label for an add-to-cart button, shared by every surface that
 * offers one so the three states — writing, ready, full — read the same way
 * everywhere and can't drift apart one surface at a time.
 */
export function addToCartAriaLabel({
  isAdding,
  canAdd,
  addingLabel,
  readyLabel,
  fullLabel,
}: AddToCartLabelState): string {
  if (isAdding) {
    return addingLabel;
  }

  return canAdd ? readyLabel : fullLabel;
}
