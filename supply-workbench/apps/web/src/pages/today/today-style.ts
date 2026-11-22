import type { CSSProperties } from 'react';
import { bg, brand, fontSize, space, statusColor, text } from '../../theme/tokens.js';
import type { RowFace } from '../../features/today/index.js';

const [tiny, small, medium, regular] = space;

export function screenStyle(): CSSProperties {
  return { display: 'flex', flexDirection: 'column', gap: regular, background: bg.page };
}

export function chipRowStyle(): CSSProperties {
  return { display: 'flex', flexWrap: 'wrap', gap: small, alignItems: 'center' };
}

export function groupStyle(): CSSProperties {
  return { marginBottom: medium };
}

export function headStyle(): CSSProperties {
  return { display: 'flex', flexWrap: 'wrap', gap: small, alignItems: 'center', paddingBottom: small, borderBottom: `1px solid ${statusColor.neutral.border}` };
}

export function titleStyle(): CSSProperties {
  return { color: text.primary, fontSize: fontSize.section, fontWeight: 600 };
}

export function countStyle(): CSSProperties {
  return { color: text.secondary, fontSize: fontSize.body };
}

export function rowStyle(input: { readonly isFocused: boolean; readonly isFading: boolean }): CSSProperties {
  return {
    background: 'transparent',
    borderBottom: `1px solid ${statusColor.neutral.border}`,
    cursor: 'pointer',
    outline: input.isFocused ? `2px solid ${brand[600]}` : 'none',
    opacity: input.isFading ? 0 : 1,
    padding: `${small}px 0`,
  };
}

export function todayMotionCss(): string {
  return '.today-row{transition:opacity 180ms ease-out}@media (prefers-reduced-motion: reduce){.today-row{transition:none}}';
}

export function reasonStyle(): CSSProperties {
  return { color: text.primary, fontSize: fontSize.section, fontWeight: 600 };
}

export function overdueStyle(tone: RowFace['overdueTone']): CSSProperties {
  if (tone === 'danger') {
    return {
      color: statusColor.danger.text,
      background: statusColor.danger.bg,
      fontSize: fontSize.section,
      fontWeight: 600,
      padding: `0 ${tiny}px`,
    };
  }
  return { color: text.secondary, fontSize: fontSize.body };
}

export function metaStyle(): CSSProperties {
  return { color: text.secondary, fontSize: fontSize.body, marginTop: tiny };
}

export function faceStackStyle(): CSSProperties {
  return { display: 'flex', flexDirection: 'column', gap: tiny };
}

export function helpStyle(): CSSProperties {
  return { color: text.secondary, fontSize: fontSize.body };
}
