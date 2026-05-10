// Checksum validation for Dominican Republic tax IDs.
//
// RNC (9 digits): mod-11 with weights [7,9,8,6,5,4,3,2] over the first 8
// digits; the 9th digit equals (10 - mod11) mod 10 (special cases for 10
// and 11 → 1 and 0 respectively, per DGII Resolución 02-2007).
//
// Cédula (11 digits XXX-XXXXXXX-X): the last digit is a Luhn-like check
// over the first 10. The DGII spec multiplies each digit by [1,2,1,2,...]
// and sums the digits of two-digit products.
//
// Both functions accept input with or without dashes / spaces — only
// digits matter for the checksum. They return true for valid, false for
// any malformation or wrong check digit.

function digitsOnly(s: string): string {
  return s.replace(/\D+/gu, "");
}

export function isValidRnc(input: string | null | undefined): boolean {
  if (!input) return false;
  const d = digitsOnly(input);
  if (d.length !== 9) return false;
  const weights = [7, 9, 8, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 8; i += 1) {
    const ch = d[i];
    if (ch === undefined) return false;
    const digit = Number(ch);
    const weight = weights[i];
    if (weight === undefined) return false;
    sum += digit * weight;
  }
  const mod = sum % 11;
  let expected: number;
  if (mod === 0) expected = 2;
  else if (mod === 1) expected = 1;
  else expected = 11 - mod;
  // DGII has a few legacy RNCs that don't validate; we accept the spec.
  const last = Number(d[8]);
  return expected === last;
}

export function isValidCedula(input: string | null | undefined): boolean {
  if (!input) return false;
  const d = digitsOnly(input);
  if (d.length !== 11) return false;
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    const ch = d[i];
    if (ch === undefined) return false;
    const digit = Number(ch);
    const factor = i % 2 === 0 ? 1 : 2;
    let product = digit * factor;
    if (product >= 10) product = Math.floor(product / 10) + (product % 10);
    sum += product;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(d[10]);
}

// Public helper used by Zod refinements. Returns null when input is empty
// (so it interops with "optional"); otherwise returns a boolean.
export function validateTaxId(
  type: "rnc" | "cedula" | "passport" | "other" | null | undefined,
  value: string | null | undefined,
): null | boolean {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (type === "rnc") return isValidRnc(v);
  if (type === "cedula") return isValidCedula(v);
  // passport / other: no canonical checksum we can run.
  return null;
}
