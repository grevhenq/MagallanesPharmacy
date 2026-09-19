// ============================================================
// Centralized money math. Cart, checkout, receipt and saved
// transaction all call computeTotals() so they agree exactly.
// ============================================================
import { S } from './db.js';

export const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeTotals(lines, customerType, vatRate, vatInclusive){
  const rate = Number(vatRate) || 12;
  const divisor = 1 + rate / 100;
  const isSenior = customerType === 'senior' || customerType === 'pwd';

  let grossSubtotal = 0;
  const computed = lines.map(l => {
    const qty  = Number(l.qty) || 0;
    const unit = Number(l.unit_price) || 0;
    const lineGross = round2(qty * unit);
    grossSubtotal += lineGross;
    return { ...l, qty, unit_price:unit, line_gross:lineGross };
  });

  let vatableSales = 0, vatExemptSales = 0, vatAmount = 0, discountTotal = 0, netTotal = 0;

  const items = computed.map(l => {
    const p = (S.products || []).find(x => x.id === l.product_id);
    const eligible = isSenior && (typeof l.seniorOverride === 'boolean'
      ? l.seniorOverride
      : !!(p && p.senior_eligible));
    const lineGross = l.line_gross;

    if (!eligible){
      const vatEx = vatInclusive ? round2(lineGross / divisor) : lineGross;
      const vatAmt = vatInclusive ? round2(lineGross - vatEx) : round2(lineGross * rate / 100);
      vatableSales += vatInclusive ? vatEx : lineGross;
      vatAmount += vatAmt;
      netTotal += lineGross;
      return { ...l, senior_eligible:false, senior_discount:0,
        vat_exempt_sales:0, vatable_sales:vatEx, vat:vatAmt, line_total:lineGross };
    }

    // Senior/PWD eligible: strip VAT, then 20% off the VAT-exempt price.
    const vatExemptPrice = round2(lineGross / divisor);
    const discount = round2(vatExemptPrice * 0.20);
    const lineTotal = round2(vatExemptPrice - discount);
    vatExemptSales += vatExemptPrice;
    discountTotal += discount;
    netTotal += lineTotal;
    return { ...l, senior_eligible:true, senior_discount:discount,
      vat_exempt_sales:vatExemptPrice, vatable_sales:0, vat:0, line_total:lineTotal };
  });

  return {
    customer_type: customerType,
    gross_subtotal: round2(grossSubtotal),
    vatable_sales: round2(vatableSales),
    vat_exempt_sales: round2(vatExemptSales),
    vat: round2(vatAmount),
    senior_discount: round2(discountTotal),
    discount: round2(discountTotal),
    total: round2(netTotal),
    items
  };
}