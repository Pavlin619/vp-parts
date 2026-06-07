interface LineItem {
  unitPriceCents: number;
  quantity: number;
}

export class PriceCalculator {
  constructor(private readonly vatRate: number) {}

  lineTotal(unitPriceCents: number, quantity: number): number {
    return unitPriceCents * quantity;
  }

  subtotal(lines: LineItem[]): number {
    return lines.reduce(
      (sum, line) => sum + this.lineTotal(line.unitPriceCents, line.quantity),
      0,
    );
  }

  vatAmount(subtotalCents: number): number {
    return Math.round(subtotalCents * this.vatRate);
  }

  orderTotal(lines: LineItem[]): number {
    const sub = this.subtotal(lines);
    return sub + this.vatAmount(sub);
  }
}
