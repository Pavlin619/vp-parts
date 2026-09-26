const SHOP_CALENDAR = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Sofia',
});

/** The shop-local `YYYY-MM-DD` an instant falls on. */
export function shopDateOf(instant: string | number): string {
  return SHOP_CALENDAR.format(new Date(instant));
}
