// Optional +972 / 00972 / 972 prefix, optional trunk 0, then an Israeli
// national number: mobile 5X, VoIP 7X (9 digits) or a landline area code (8 digits).
const IL_PHONE = /^(?:\+972|00972|972)?0?(5\d{8}|7\d{8}|[2-489]\d{7})$/;

export const IL_MOBILE_E164 = /^\+9725\d{8}$/;
export const IL_PHONE_E164 = /^\+972\d{8,9}$/;

/** Returns the number in E.164 (+972...), or null when it isn't a valid Israeli number. */
export function normalizeIsraeliPhone(raw: string): string | null {
  const match = IL_PHONE.exec(raw.replace(/[\s\-().]/g, ""));
  return match ? `+972${match[1]}` : null;
}
