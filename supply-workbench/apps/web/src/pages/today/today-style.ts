import type { CSSProperties } from 'react';
import { bg, brand, fontSize, space, statusColor, text, topBar } from '../../theme/tokens.js';
import type { RowFace } from '../../features/today/index.js';

const [tiny, small, , regular] = space;

export function screenStyle(): CSSProperties {
  return { display: 'flex', flexDirection: 'column', gap: regular, background: bg.page };
}

export function rowStyle(input: { readonly isFocused: boolean; readonly isFading: boolean }): CSSProperties {
  return {
    background: 'transparent',
    borderBottom: `1px solid ${statusColor.neutral.border}`,
    outline: input.isFocused ? `2px solid ${brand[600]}` : 'none',
    opacity: input.isFading ? 0 : 1,
    padding: `${small}px 0`,
  };
}

export function todayMotionCss(): string {
  return `
    .today-row { transition: opacity 180ms ease-out; overflow-wrap: anywhere; }
    .today-jump-target { scroll-margin-block-start: ${topBar + regular}px; }
    .today-touch .ant-select { max-inline-size: 100%; }
    .today-metric-summary { display: none; }
    @media (max-width: 480px) {
      .today-metric-cards { display: none; }
      .today-metric-summary { display: flex; flex-wrap: wrap; gap: ${tiny}px ${small}px; }
    }
    @media (any-pointer: coarse) {
      .today-touch .ant-btn, .today-touch .ant-select, .today-touch .ant-tag-checkable, .today-touch .ant-segmented-item-label {
        min-block-size: 44px;
        min-inline-size: 44px;
      }
      .today-touch .ant-tag-checkable, .today-touch .ant-segmented-item-label { display: inline-flex; align-items: center; justify-content: center; }
    }
    @media (prefers-reduced-motion: reduce) { .today-row { transition: none; } }
  `;
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
