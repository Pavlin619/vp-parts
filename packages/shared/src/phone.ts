import { parsePhoneNumberFromString } from 'libphonenumber-js/mobile';

/**
 * A Bulgarian mobile number in E.164 (`+359888123456`), or null when the input
 * is not one. Ranges come from Google's numbering metadata, so a prefix no
 * operator holds or a landline is refused without an SMS ever being sent.
 */
export function toBulgarianMobile(input: string): string | null {
  const phone = parsePhoneNumberFromString(input, 'BG');

  return phone?.country === 'BG' && phone.isValid() ? phone.number : null;
}

export function isBulgarianMobile(input: string): boolean {
  return toBulgarianMobile(input) !== null;
}
