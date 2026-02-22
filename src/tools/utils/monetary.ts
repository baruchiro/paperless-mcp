/**
 * Utilities for validating and formatting monetary custom field values.
 *
 * Paperless-NGX requires monetary values in the format: {CURRENCY_CODE}{amount}
 * Examples: USD10.00, GBP123.45, EUR9.99
 *
 * Common mistakes include trailing currency symbols (e.g., 10.00$) which the
 * backend will reject.
 */

/** Regex detecting values with a trailing currency symbol (common mistake, e.g., "10.00$") */
const TRAILING_SYMBOL_REGEX = /^(\d+(?:\.\d+)?)[$€£¥₹]$/;

/** Map of common currency symbols to ISO 4217 currency codes */
const SYMBOL_TO_CODE: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
};

/**
 * Checks if a string value looks like a monetary amount with a trailing currency
 * symbol (a common mistake), and returns an actionable error message if so.
 *
 * Only flags obvious formatting mistakes — does not validate general string values.
 *
 * @param value - The custom field string value to check
 * @returns An error message string if an invalid monetary pattern is detected, or null otherwise
 */
export function getMonetaryValidationError(value: string): string | null {
  const trailingMatch = TRAILING_SYMBOL_REGEX.exec(value);
  if (trailingMatch) {
    const amount = trailingMatch[1];
    const symbol = value.slice(-1);
    const code = SYMBOL_TO_CODE[symbol] || "USD";
    const numericAmount = parseFloat(amount);
    const formattedAmount = isNaN(numericAmount) ? amount : numericAmount.toFixed(2);
    return (
      `Invalid monetary format "${value}". ` +
      `Paperless-NGX requires the currency code as a prefix, e.g. "${code}${formattedAmount}". ` +
      `Use the format: {CURRENCY_CODE}{amount} (e.g., USD10.00, GBP123.45, EUR9.99).`
    );
  }

  return null;
}
