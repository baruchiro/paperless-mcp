const SYMBOL_TO_CODE: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "₹": "INR",
};

const TRAILING_SYMBOL_REGEX = new RegExp(
  `^(\\d+(?:\\.\\d+)?)[${Object.keys(SYMBOL_TO_CODE).join("")}]$`
);

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
