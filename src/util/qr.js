import QRCode from "qrcode";
import { STROOP_DECIMALS, WEI_DECIMALS, formatMinor } from "./amounts.js";

export function paymentUri(invoice) {
  if (invoice.asset === "eth") {
    return `ethereum:${invoice.destination}?value=${invoice.expectedAmount.toString()}`;
  }

  const amount = formatMinor(invoice.expectedAmount, STROOP_DECIMALS);
  const params = new URLSearchParams({
    destination: invoice.destination,
    amount,
    memo: invoice.memo,
  });
  return `web+stellar:pay?${params.toString()}`;
}

export function paymentDisplayAmount(invoice) {
  if (invoice.asset === "eth") {
    return formatMinor(invoice.expectedAmount, WEI_DECIMALS);
  }
  return formatMinor(invoice.expectedAmount, STROOP_DECIMALS);
}

export async function invoiceQrDataUrl(invoice) {
  return QRCode.toDataURL(paymentUri(invoice));
}
