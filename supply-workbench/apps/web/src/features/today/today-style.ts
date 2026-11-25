import type { CSSProperties } from 'react';
import { bg, border, brand, fontSize, space, statusColor, text, topBar } from '../../theme/tokens.js';
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
    .today-kanban { display: grid; grid-template-columns: minmax(0, 1fr); gap: ${regular}px; align-items: start; }
    .today-kanban-lane { min-inline-size: 0; display: flex; flex-direction: column; gap: ${small}px; }
    .today-grouped-row { border-bottom: 1px solid ${statusColor.neutral.border}; padding-block: ${small}px; }
    ${todayCardCss()}
    .today-jump-target { scroll-margin-block-start: ${topBar + regular}px; }
    .today-touch .ant-select { max-inline-size: 100%; }
    #today-chase { container: today-action / inline-size; }
    @container today-action (max-width: 22rem) {
      .today-filter-copy-label { display: none; }
    }
    .today-controls-wide { display: contents; }
    .today-controls-narrow { display: none; }
    @media (max-width: 520px) {
      .today-controls-wide { display: none; }
      .today-controls-narrow { display: block; }
      .today-workspace-views .ant-segmented-item-icon { display: none; }
    }
    @container today-action (min-width: 60rem) {
      .today-kanban { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    @media (any-pointer: coarse) {
      .today-touch .ant-btn, .today-touch .ant-select, .today-touch .ant-tag-checkable, .today-touch .ant-segmented-item-label, .today-touch > a {
        min-block-size: 44px;
        min-inline-size: 44px;
      }
      .today-touch .ant-tag-checkable, .today-touch .ant-segmented-item-label, .today-touch > a { display: inline-flex; align-items: center; justify-content: center; }
    }
    @media (prefers-reduced-motion: reduce) { .today-row { transition: none; } }
  `;
}

function todayCardCss(): string {
  return `
    .today-work-card { container: today-card / inline-size; }
    .today-row-layout { display: grid; gap: ${small}px; }
    .today-row-facts, .today-row-follow-up { display: grid; gap: ${tiny}px; min-inline-size: 0; }
    .today-row-facts .today-row-title { margin: 0; font-size: ${fontSize.section}px; line-height: 1.4; }
    .today-row-line {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0 ${space[2]}px;
      min-inline-size: 0;
    }
    .today-row-line:empty, .today-row-follow-up:has(> :only-child:empty) { display: none; }
    .today-row-identifiers, .today-row-follow-up { font-size: ${fontSize.table}px; }
    .today-row-line .ant-tag { margin-inline-end: 0; }
    .today-row-quantities { font-variant-numeric: tabular-nums; font-weight: 600; }
    .today-row-follow-up { border-block-start: 1px solid ${border}; padding-block-start: ${tiny}px; }
    .today-row-actions { min-inline-size: 0; }
    @container today-card (min-width: 44rem) {
      .today-row-layout { grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
      .today-row-actions {
        display: grid;
        grid-template-columns: repeat(2, 7.75rem) 4.75rem 4.25rem;
      }
      .today-row-actions > * { grid-row: 1; }
      .today-row-actions > .today-action-copy { grid-column: 2; }
      .today-row-actions > .today-action-detail, .today-pending-actions > a:not(.ant-btn-primary) { grid-column: 3; }
      .today-row-actions > .today-action-more { grid-column: 4; }
      .today-row-actions > .ant-btn-primary { grid-column: 1; }
      .today-pending-actions > a:not(.ant-btn-primary) { text-align: center; }
      .today-row-follow-up { grid-column: 1 / -1; }
    }
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

export function helpStyle(): CSSProperties {
  return { color: text.secondary, fontSize: fontSize.body };
}
