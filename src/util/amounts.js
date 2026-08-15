export const WEI_DECIMALS = 18;
export const STROOP_DECIMALS = 7;

export function parseDecimalToMinor(value, decimals) {
  if (typeof value !== "string" || !/^\d+(\.\d+)?$/.test(value)) {
    throw new Error(`invalid decimal amount: ${value}`);
  }

  const [wholeRaw, fractionRaw = ""] = value.split(".");
  if (fractionRaw.length > decimals) {
    throw new Error(`too many fractional digits for ${decimals} places`);
  }

  const fraction = fractionRaw.padEnd(decimals, "0");
  return BigInt(wholeRaw) * 10n ** BigInt(decimals) + BigInt(fraction || "0");
}

export function formatMinor(amount, decimals) {
  if (typeof amount !== "bigint") {
    throw new Error("amount must be a bigint");
  }

  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  let fraction = (abs % scale).toString().padStart(decimals, "0");
  fraction = fraction.replace(/0+$/, "");
  const sign = negative ? "-" : "";
  return fraction.length === 0
    ? `${sign}${whole}`
    : `${sign}${whole}.${fraction}`;
}

export function isAtLeast(received, expected) {
  return received >= expected;
}

export function compareAmount(received, expected) {
  if (received < expected) {
    return "under";
  }
  if (received > expected) {
    return "over";
  }
  return "exact";
}
