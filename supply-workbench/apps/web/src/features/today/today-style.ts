import type { CSSProperties } from 'react';
import { bg, border, brand, controlBorder, fontSize, space, statusColor, text, topBar } from '../../theme/tokens.js';
import type { RowFace } from './model/types.js';
import { todayBatchCardCss } from './today-row-style.js';

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
    .today-kanban-lane[data-active="false"] { display: none; }
    .today-lane-links { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: ${tiny}px; }
    .today-lane-links > .ant-btn { min-block-size: 44px; block-size: auto; padding-inline: ${tiny}px; gap: ${tiny}px; font-size: ${fontSize.meta}px; }
    .today-lane-links > .ant-btn[aria-pressed="true"] { background: ${brand[100]}; color: ${brand[800]}; border-color: ${brand[600]}; }
    .today-lane-heading { position: absolute; inline-size: 1px; block-size: 1px; clip-path: inset(50%); overflow: hidden; white-space: nowrap; }
    .today-grouped-row { border-bottom: 1px solid ${statusColor.neutral.border}; padding-block: ${small}px; }
    ${todayCardCss()}
    ${todayBatchCardCss()}
    ${todayWorkspaceCss()}
    .today-jump-target { scroll-margin-block-start: ${topBar + regular}px; }
    .today-touch .ant-select { max-inline-size: 100%; }
    #today-chase { container: today-action / inline-size; }
    @container today-action (min-width: 60rem) {
      .today-kanban { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .today-kanban-lane[data-active="false"] { display: flex; }
      .today-lane-links { display: none; }
      .today-lane-heading { position: static; inline-size: auto; block-size: auto; clip-path: none; overflow: visible; white-space: normal; }
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

function todayWorkspaceCss(): string {
  return `
    .today-workspace-screen { container: today-workspace / inline-size; }
    .today-workspace-intro { display: grid; gap: ${small}px; }
    .today-workspace-heading, .today-workspace-scopes { display: flex; align-items: baseline; flex-wrap: wrap; gap: ${tiny}px ${small}px; }
    .today-workspace-heading { justify-content: space-between; }
    .today-workspace-heading .ant-typography { margin: 0; }
    .today-workspace-heading h2 { font-size: ${fontSize.page}px; line-height: 1.4; }
    .today-workspace-heading h2 strong { font-size: ${fontSize.metric}px; line-height: 1; }
    .today-workspace-heading h2 small, .today-workspace-heading .today-business-date, .today-toolbar .procurement-cutoff { font-size: ${fontSize.meta}px; }
    .today-workspace-heading h2 small { color: ${text.secondary}; font-weight: 500; }
    .today-workspace-heading h2 strong, .today-workspace-scopes strong, .today-business-date { font-variant-numeric: tabular-nums; }
    .today-workspace-scopes > .ant-btn { gap: ${tiny}px; border-color: ${border}; padding-inline: 10px; }
    .today-toolbar { padding-block-end: ${small}px; border-block-end: 1px solid ${border}; }
    .today-toolbar-main { min-inline-size: 0; }
    .today-toolbar .today-workspace-views { box-shadow: inset 0 0 0 1px ${border}; }
    .today-priority-block { display: grid; gap: ${small}px; }
    .today-priority-block + .today-priority-block { margin-block-start: ${small}px; }
    .today-priority-block .today-priority-heading { display: flex; align-items: baseline; gap: ${small}px; margin: 0; font-size: ${fontSize.section}px; }
    .today-priority-heading > .ant-typography { font-size: ${fontSize.meta}px; font-weight: 500; }
    @container today-workspace (max-width: 28rem) {
      .today-workspace-heading { align-items: start; flex-direction: column; }
      .today-workspace-scopes > .ant-btn { min-block-size: 44px; block-size: auto; }
    }
    @container today-action (max-width: 26rem) {
      .today-toolbar-main, .today-toolbar-buttons { gap: ${tiny}px; }
      .today-toolbar-buttons > .ant-btn { min-block-size: 44px; min-inline-size: 44px; padding-inline: ${tiny}px; }
      .today-toolbar-buttons > .ant-btn .anticon, .today-workspace-views .ant-segmented-item-icon { display: none; }
      .today-toolbar .today-workspace-views .ant-segmented-item, .today-toolbar .today-workspace-views .ant-segmented-item-label { min-inline-size: 44px; }
      .today-toolbar .today-workspace-views .ant-segmented-item-label { display: grid; place-items: center; min-block-size: 44px; padding-inline: 2px; }
      .today-copy-panel .ant-radio-wrapper { min-block-size: 44px; align-items: center; }
    }
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
    ${todayPrimaryActionCss()}
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

function todayPrimaryActionCss(): string {
  const primary = '.today-row .today-row-actions > .ant-btn.ant-btn-primary:not(:disabled, .ant-btn-disabled)';
  return `
    ${primary} { background: ${bg.surface}; color: ${text.primary}; border-color: ${controlBorder}; }
    @media (hover: hover) {
      ${primary}:hover { background: ${statusColor.neutral.bg}; color: ${text.primary}; border-color: ${text.tertiary}; }
    }
    ${primary}:active { background: ${statusColor.neutral.border}; color: ${text.primary}; border-color: ${text.secondary}; }
    ${primary}:focus-visible { outline-color: ${text.primary}; }
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
