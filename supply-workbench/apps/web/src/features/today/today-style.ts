import type { CSSProperties } from 'react';
import { bg, brand, fontSize, space, statusColor, text, topBar } from '../../theme/tokens.js';
import type { RowFace } from './model/types.js';

const [tiny, small, , regular] = space;

export function screenStyle(): CSSProperties {
  return { display: 'flex', flexDirection: 'column', gap: regular, background: bg.page };
}

export function rowStyle(input: { readonly isFocused: boolean; readonly isFading: boolean }): CSSProperties {
  return {
    outline: input.isFocused ? `2px solid ${brand[600]}` : 'none',
    outlineOffset: input.isFocused ? 2 : undefined,
    opacity: input.isFading ? 0 : 1,
  };
}

export function todayMotionCss(): string {
  return `
    .today-row { transition: opacity 180ms ease-out; overflow-wrap: anywhere; }
    .today-action-list { list-style: none; margin: 0; padding: 0; }
    .today-priority-list { display: flex; flex-direction: column; gap: ${small}px; }
    .today-action-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: ${regular}px; }
    .today-kanban { display: grid; grid-template-columns: minmax(0, 1fr); gap: ${regular}px; align-items: start; }
    .today-kanban-lane { min-inline-size: 0; display: flex; flex-direction: column; gap: ${small}px; }
    .today-grouped-row { border-bottom: 1px solid ${statusColor.neutral.border}; padding-block: ${small}px; }
    .today-row-facts, .today-row-actions { min-inline-size: 0; }
    .today-row-facts { gap: ${tiny}px; }
    .today-jump-target { scroll-margin-block-start: ${topBar + regular}px; }
    .today-touch .ant-select { max-inline-size: 100%; }
    @media (min-width: 960px) {
      .today-kanban { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    @media (min-width: 1200px) {
      .today-action-layout-aside { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
    }
    @media (min-width: 980px) {
      .today-row-layout.ant-flex-vertical { flex-direction: row; justify-content: space-between; align-items: center; }
      .today-row-layout > .today-row-facts { flex: 1 1 22rem; }
    }
    @media (any-pointer: coarse) {
      .today-touch .ant-btn, .today-touch .ant-select, .today-touch .ant-tag-checkable, .today-touch .ant-segmented-item-label {
        min-block-size: 44px;
        min-inline-size: 44px;
      }
      .today-touch .ant-tag-checkable, .today-touch .ant-segmented-item-label { display: inline-flex; align-items: center; justify-content: center; }
      .today-receipt-task a { display: inline-flex; align-items: center; min-block-size: 44px; }
    }
    @media (prefers-reduced-motion: reduce) { .today-row { transition: none; } }
  `;
}

export function reasonStyle(): CSSProperties {
  return { color: text.secondary, fontSize: fontSize.table };
}

export function overdueStyle(tone: RowFace['overdueTone']): CSSProperties {
  if (tone === 'danger') {
    return {
      color: statusColor.danger.text,
      background: statusColor.danger.bg,
      fontSize: fontSize.meta,
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
