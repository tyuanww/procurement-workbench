export const brand = {
  600: '#805D9D',
  800: '#4A2D5E',
  400: '#A088BF',
  300: '#C2AED5',
  200: '#D3C3E8',
  100: '#E8DCF0',
} as const;

export const primaryHover = '#6D4C83';

export const dwellColor = {
  '0-3': brand[400],
  '4-7': brand[600],
  '8-14': primaryHover,
  '15+': brand[800],
} as const;

export const text = {
  primary: '#1F1A24',
  secondary: '#5C5566',
  tertiary: '#6E6777',
} as const;

export const border = '#E6E1EA';
export const controlBorder = '#918A99';

export const bg = {
  page: '#F7F5F9',
  surface: '#FFFFFF',
} as const;

export const onBrand = {
  solid: '#FFFFFF',
  muted: '#C0B6C7',
} as const;

export const statusColor = {
  danger: { text: '#B42318', bg: '#FEF3F2', border: '#ECBFBC' },
  warning: { text: '#93370D', bg: '#FFFAEB', border: '#E4C9B4' },
  info: { text: '#1849A9', bg: '#EFF8FF', border: '#B9CCEA' },
  success: { text: '#067647', bg: '#ECFDF3', border: '#B2DBC8' },
  attention: { text: '#B93815', bg: '#FEF6EE', border: '#EDC6B8' },
  neutral: { text: '#5C5566', bg: '#F2F0F4', border: '#CCC9D0' },
} as const;

export const fontFamily =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif';

export const fontSize = {
  meta: 12,
  table: 13,
  body: 14,
  section: 16,
  page: 20,
  metric: 28,
} as const;

export const space = [4, 8, 12, 16, 24, 32] as const;
export const radius = 6;
export const radiusCard = 8;
export const navWidth = 208;
export const navCollapsed = 56;
export const topBar = 52;
export const drawerWidth = 480;
export const drawerWide = 720;
export const rowCompact = 36;
export const rowComfort = 44;

export type ContrastKind = 'text' | 'border';

export type ContrastPair = {
  readonly name: string;
  readonly foreground: string;
  readonly background: string;
  readonly kind: ContrastKind;
};

/** 屏幕上会同时出现的文字/背景，以及控件边框/背景。分割线不在这里。 */
export const contrastPairs: readonly ContrastPair[] = [
  { name: 'text.primary/page', foreground: text.primary, background: bg.page, kind: 'text' },
  { name: 'text.primary/surface', foreground: text.primary, background: bg.surface, kind: 'text' },
  { name: 'text.primary/brand.100', foreground: text.primary, background: brand[100], kind: 'text' },
  { name: 'text.primary/brand.200', foreground: text.primary, background: brand[200], kind: 'text' },
  { name: 'text.primary/brand.300', foreground: text.primary, background: brand[300], kind: 'text' },
  { name: 'text.secondary/page', foreground: text.secondary, background: bg.page, kind: 'text' },
  { name: 'text.secondary/surface', foreground: text.secondary, background: bg.surface, kind: 'text' },
  { name: 'text.secondary/neutral', foreground: text.secondary, background: statusColor.neutral.bg, kind: 'text' },
  { name: 'text.tertiary/page', foreground: text.tertiary, background: bg.page, kind: 'text' },
  { name: 'text.tertiary/surface', foreground: text.tertiary, background: bg.surface, kind: 'text' },
  { name: 'status.danger', foreground: statusColor.danger.text, background: statusColor.danger.bg, kind: 'text' },
  { name: 'status.danger/surface', foreground: statusColor.danger.text, background: bg.surface, kind: 'text' },
  { name: 'status.warning', foreground: statusColor.warning.text, background: statusColor.warning.bg, kind: 'text' },
  { name: 'status.warning/surface', foreground: statusColor.warning.text, background: bg.surface, kind: 'text' },
  { name: 'status.info', foreground: statusColor.info.text, background: statusColor.info.bg, kind: 'text' },
  { name: 'status.info/surface', foreground: statusColor.info.text, background: bg.surface, kind: 'text' },
  { name: 'status.success', foreground: statusColor.success.text, background: statusColor.success.bg, kind: 'text' },
  { name: 'status.success/surface', foreground: statusColor.success.text, background: bg.surface, kind: 'text' },
  { name: 'status.attention', foreground: statusColor.attention.text, background: statusColor.attention.bg, kind: 'text' },
  { name: 'status.attention/surface', foreground: statusColor.attention.text, background: bg.surface, kind: 'text' },
  { name: 'status.neutral', foreground: statusColor.neutral.text, background: statusColor.neutral.bg, kind: 'text' },
  { name: 'status.neutral/surface', foreground: statusColor.neutral.text, background: bg.surface, kind: 'text' },
  { name: 'white/brand.600', foreground: onBrand.solid, background: brand[600], kind: 'text' },
  { name: 'white/primaryHover', foreground: onBrand.solid, background: primaryHover, kind: 'text' },
  { name: 'white/brand.800', foreground: onBrand.solid, background: brand[800], kind: 'text' },
  { name: 'onBrand.muted/brand.800', foreground: onBrand.muted, background: brand[800], kind: 'text' },
  { name: 'brand.600/surface', foreground: brand[600], background: bg.surface, kind: 'text' },
  { name: 'brand.600/page', foreground: brand[600], background: bg.page, kind: 'text' },
  { name: 'primaryHover/surface', foreground: primaryHover, background: bg.surface, kind: 'text' },
  { name: 'primaryHover/page', foreground: primaryHover, background: bg.page, kind: 'text' },
  { name: 'brand.800/brand.200', foreground: brand[800], background: brand[200], kind: 'text' },
  { name: 'brand.800/brand.300', foreground: brand[800], background: brand[300], kind: 'text' },
  { name: 'controlBorder/surface', foreground: controlBorder, background: bg.surface, kind: 'border' },
  { name: 'controlBorder/page', foreground: controlBorder, background: bg.page, kind: 'border' },
];
