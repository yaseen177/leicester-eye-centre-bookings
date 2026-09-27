// ============================================================================
// VAT ENGINE — The Eye Centre Leicester Limited (standard VAT accounting)
// ============================================================================
//
// How optical VAT works (HMRC VATHLT2190 + Revenue & Customs Brief 14/2020):
//   * Sight tests / eye examinations, CL fitting & aftercare, and other
//     clinical services by a registered optometrist → EXEMPT
//     (VATA 1994 Sch 9 Group 7 Item 1).
//   * Dispensed spectacles / contact lenses are TWO supplies:
//       - the goods (frames, lenses, CLs)        → STANDARD rated (20%)
//       - the dispensing service                → EXEMPT
//   * We use the "separately disclosed charges" method: every receipt shows
//     the goods charge and the dispensing charge as two separate lines at
//     the time of sale. Brief 14/2020 says a till slip showing the split is
//     sufficient evidence — that's what receipt.ts produces.
//   * Accessories, cases, cloths, solutions, plano sunglasses, frames sold on
//     their own (no dispensing) → STANDARD rated.
//
// The dispensing split (percent of price, or a fixed fee per pair) lives in
// settings/vat so it can be changed without a deploy. It must be "fair and
// reasonable" — get your accountant to sign off the figure. Until it's set,
// dispensed items are treated as 100% goods (fully standard-rated), which
// over-declares rather than under-declares VAT.
//
// All shop prices are VAT-INCLUSIVE. VAT is extracted per line: gross × r/(100+r).
// ============================================================================

export type VatCategory = 'standard' | 'zero' | 'exempt' | 'dispensed';
export type DispenseKind = 'spectacles' | 'contactLenses';

export const VAT_CATEGORY_LABELS: Record<VatCategory, string> = {
  standard: 'Standard rated (20%)',
  zero: 'Zero rated (0%)',
  exempt: 'Exempt (clinical service)',
  dispensed: 'Dispensed appliance (goods 20% + dispensing exempt)'
};

export interface VatSettings {
  vatRate: number;                        // 20
  splitMethod: 'percent' | 'fixed';
  spectaclesExemptPercent: number;        // % of a dispensed pair that is the exempt dispensing service
  contactLensExemptPercent: number;       // % of a dispensed CL supply that is the exempt dispensing service
  spectaclesFixedFee: number;             // £ per pair (when splitMethod === 'fixed')
  contactLensFixedFee: number;            // £ per supply (when splitMethod === 'fixed')
  splitConfirmedBy: string;               // who signed the split off (accountant name) — blank = not confirmed
  companyName: string;
  addressLines: string[];
  phone: string;
  email: string;
  vatNumber: string;
  companyNumber: string;
  cashVarianceTolerance: number;          // £ — a cash-up beyond this needs reason + sign-off
  staffNames: string[];
}

export const DEFAULT_VAT_SETTINGS: VatSettings = {
  vatRate: 20,
  splitMethod: 'percent',
  spectaclesExemptPercent: 0,
  contactLensExemptPercent: 0,
  spectaclesFixedFee: 0,
  contactLensFixedFee: 0,
  splitConfirmedBy: '',
  companyName: 'The Eye Centre Leicester Limited',
  addressLines: ['56 High Street', 'Leicester', 'LE1 5YN'],
  phone: '0116 253 2788',
  email: '',
  vatNumber: 'GB531912464',
  companyNumber: '11846922',
  cashVarianceTolerance: 0,
  staffNames: []
};

export const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

export const gbp = (n: number): string => {
  const v = round2(n);
  return `${v < 0 ? '-' : ''}£${Math.abs(v).toFixed(2)}`;
};

// One line after VAT analysis. Every £ of `gross` lands in exactly one of
// standardGross / zeroGross / exemptGross.
export interface VatBreakdown {
  gross: number;
  standardGross: number;   // VAT-inclusive standard-rated portion
  standardNet: number;
  vat: number;
  zeroGross: number;
  exemptGross: number;
}

export const emptyBreakdown = (): VatBreakdown => ({ gross: 0, standardGross: 0, standardNet: 0, vat: 0, zeroGross: 0, exemptGross: 0 });

export const extractVat = (gross: number, rate: number): number => round2(gross * rate / (100 + rate));

// Exempt (dispensing) portion of a dispensed appliance's price.
export const dispensingPortion = (gross: number, kind: DispenseKind, s: VatSettings): number => {
  if (gross <= 0) return 0;
  if (s.splitMethod === 'fixed') {
    const fee = kind === 'spectacles' ? s.spectaclesFixedFee : s.contactLensFixedFee;
    return round2(Math.min(gross, Math.max(0, Number(fee) || 0)));
  }
  const pct = kind === 'spectacles' ? s.spectaclesExemptPercent : s.contactLensExemptPercent;
  return round2(gross * Math.min(100, Math.max(0, Number(pct) || 0)) / 100);
};

// Handles negative gross (refunds) by analysing the absolute value and
// flipping the sign, so a refund mirrors the original sale exactly.
export const analyseLine = (gross: number, category: VatCategory, s: VatSettings, kind: DispenseKind = 'spectacles'): VatBreakdown => {
  const sign = gross < 0 ? -1 : 1;
  const g = round2(Math.abs(gross));
  const b = emptyBreakdown();
  b.gross = g;
  if (category === 'exempt') b.exemptGross = g;
  else if (category === 'zero') b.zeroGross = g;
  else if (category === 'standard') {
    b.standardGross = g;
    b.vat = extractVat(g, s.vatRate);
    b.standardNet = round2(g - b.vat);
  } else {
    const exempt = dispensingPortion(g, kind, s);
    b.exemptGross = exempt;
    b.standardGross = round2(g - exempt);
    b.vat = extractVat(b.standardGross, s.vatRate);
    b.standardNet = round2(b.standardGross - b.vat);
  }
  return sign === 1 ? b : scaleBreakdown(b, -1);
};

export const sumBreakdowns = (list: VatBreakdown[]): VatBreakdown =>
  list.reduce((acc, b) => ({
    gross: round2(acc.gross + b.gross),
    standardGross: round2(acc.standardGross + b.standardGross),
    standardNet: round2(acc.standardNet + b.standardNet),
    vat: round2(acc.vat + b.vat),
    zeroGross: round2(acc.zeroGross + b.zeroGross),
    exemptGross: round2(acc.exemptGross + b.exemptGross)
  }), emptyBreakdown());

export const scaleBreakdown = (b: VatBreakdown, factor: number): VatBreakdown => ({
  gross: round2(b.gross * factor),
  standardGross: round2(b.standardGross * factor),
  standardNet: round2(b.standardNet * factor),
  vat: round2(b.vat * factor),
  zeroGross: round2(b.zeroGross * factor),
  exemptGross: round2(b.exemptGross * factor)
});

// Dispense orders (the existing "Orders" system) are always dispensed
// spectacles — including "Own frame" jobs, which are lenses + dispensing.
export const analyseDispenseOrder = (order: any, s: VatSettings): { items: { label: string; breakdown: VatBreakdown }[]; total: VatBreakdown } => {
  const items = (order.items || []).map((it: any, i: number) => {
    const frame = it.frameSource === 'Own' ? 'Own frame' : `${it.frameMake || ''} ${it.frameModel || ''}`.trim();
    const lens = it.lensRight?.lensType || (it.lensRight?.mode === 'manual' ? (it.lensRight?.description || 'Lenses') : 'Lenses');
    return {
      label: `Spectacles ${i + 1}: ${frame || 'Frame'} — ${lens}`,
      breakdown: analyseLine(Number(it.total) || 0, 'dispensed', s, 'spectacles')
    };
  });
  return { items, total: sumBreakdowns(items.map((x: any) => x.breakdown)) };
};

export const isSplitConfigured = (s: VatSettings): boolean =>
  s.splitMethod === 'fixed'
    ? (s.spectaclesFixedFee > 0 || s.contactLensFixedFee > 0)
    : (s.spectaclesExemptPercent > 0 || s.contactLensExemptPercent > 0);
