export const EM_DASH = '—' as const;
export type EmDash = typeof EM_DASH;

export type FigureInput = {
  readonly numerator: number | null;
  readonly denominator: number | null;
  readonly n: number;
};

const PERCENT_SCALE = 1000;
const DAY_SCALE = 10;
const TENTH = 10;

export function countText(figure: FigureInput): string {
  if (figure.numerator === null) return EM_DASH;
  return String(figure.numerator);
}

export function rateText(figure: FigureInput): string {
  const tenths = scaledTenths(figure, PERCENT_SCALE);
  if (tenths === null) return EM_DASH;
  return formatTenths(tenths, '%');
}

export function averageText(figure: FigureInput): string {
  const tenths = scaledTenths(figure, DAY_SCALE);
  if (tenths === null) return EM_DASH;
  return formatTenths(tenths, '');
}

// weekly.rate is already numerator/denominator, so the same tenths are rounded from that ratio.
export function ratioText(rate: number | null): string {
  if (rate === null) return EM_DASH;
  return formatTenths(Math.round(rate * PERCENT_SCALE), '%');
}

function scaledTenths(figure: FigureInput, scale: number): number | null {
  const { numerator, denominator } = figure;
  if (denominator === null || denominator === 0 || numerator === null) return null;
  return Math.trunc((numerator * scale + Math.floor(denominator / 2)) / denominator);
}

function formatTenths(tenths: number, suffix: string): string {
  const whole = Math.trunc(tenths / TENTH);
  const fraction = Math.abs(tenths % TENTH);
  if (fraction === 0) return `${whole}${suffix}`;
  return `${whole}.${fraction}${suffix}`;
}
