const SRGB_BREAK = 0.04045;
const LINEAR_DIVISOR = 12.92;
const GAMMA_OFFSET = 0.055;
const GAMMA_SCALE = 1.055;
const GAMMA = 2.4;
const RED = 0.2126;
const GREEN = 0.7152;
const BLUE = 0.0722;
const CONTRAST_OFFSET = 0.05;
const HEX = 16;
const BYTE = 255;

export function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + CONTRAST_OFFSET) / (darker + CONTRAST_OFFSET);
}

function luminance(hex: string): number {
  const [red, green, blue] = channels(hex).map(linear);
  return RED * (red ?? 0) + GREEN * (green ?? 0) + BLUE * (blue ?? 0);
}

function channels(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), HEX) / BYTE,
    Number.parseInt(value.slice(2, 4), HEX) / BYTE,
    Number.parseInt(value.slice(4, 6), HEX) / BYTE,
  ];
}

function linear(channel: number): number {
  if (channel <= SRGB_BREAK) return channel / LINEAR_DIVISOR;
  return ((channel + GAMMA_OFFSET) / GAMMA_SCALE) ** GAMMA;
}
