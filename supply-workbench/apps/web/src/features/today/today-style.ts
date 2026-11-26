import type { CSSProperties } from 'react';
import { bg, border, brand, fontSize, space, statusColor, text, topBar } from '../../theme/tokens.js';
import type { RowFace } from './model/types.js';
import { todayRowCss } from './today-row-style.js';

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
    .today-lane-links { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: ${tiny}px; margin-block-end: ${small}px; }
    .today-lane-links > .ant-btn { min-block-size: 44px; block-size: auto; padding-inline: ${tiny}px; gap: ${tiny}px; font-size: ${fontSize.meta}px; }
    .today-lane-name { overflow: hidden; text-overflow: ellipsis; }
    .today-lane-count { flex: none; font-variant-numeric: tabular-nums; }
    .today-lane-links > .ant-btn[aria-pressed="true"] { background: ${brand[100]}; color: ${brand[800]}; border-color: ${brand[600]}; }
    .today-kanban-lane .today-lane-heading { display: none; }
    .today-grouped-row { border-bottom: 1px solid ${statusColor.neutral.border}; padding-block: ${small}px; }
    ${todayRowCss()}
    ${todayWorkspaceCss}
    .today-jump-target { scroll-margin-block-start: ${topBar + regular}px; }
    .today-touch .ant-select { max-inline-size: 100%; }
    #today-chase { container: today-action / inline-size; }
    @container today-action (min-width: 60rem) {
      .today-kanban { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .today-kanban-lane[data-active="false"] { display: flex; }
      .today-lane-links { display: none; }
      .today-kanban-lane .today-lane-heading { display: flex; }
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

const todayWorkspaceCss = `
    .today-workspace-screen {
      container: today-workspace / inline-size;
      inline-size: 100%;
      max-inline-size: 90rem;
      margin-inline: auto;
    }
    .today-workspace-intro { display: grid; gap: ${small}px; }
    .today-workspace-heading, .today-workspace-scopes { display: flex; align-items: safe center; flex-wrap: wrap; }
    .today-workspace-heading { gap: ${small}px ${regular}px; }
    .today-workspace-heading > .ant-typography { margin: 0; }
    .today-workspace-heading h2 { font-size: ${fontSize.page}px; line-height: 1.4; }
    .today-workspace-heading h2 strong { font-size: ${fontSize.metric}px; line-height: 1; }
    .today-workspace-heading h2 small, .today-toolbar .procurement-cutoff { font-size: ${fontSize.meta}px; }
    .today-workspace-heading h2 small { color: ${text.secondary}; font-weight: 500; }
    .today-workspace-heading .today-mine-scope { margin-inline-start: ${small}px; }
    .today-review-scope { display: flex; gap: ${small}px; align-items: center; flex-wrap: wrap; }
    .today-workspace-heading h2 strong, .today-workspace-scopes strong { font-variant-numeric: tabular-nums; }
    .today-workspace-scopes { min-inline-size: 0; gap: ${tiny}px ${small}px; }
    .today-workspace-scopes > .ant-btn { gap: ${tiny}px; border-color: ${border}; padding-inline: 10px; }
    .today-toolbar { padding-block-end: ${small}px; border-block-end: 1px solid ${border}; }
    .today-toolbar-main { min-inline-size: 0; }
    .today-toolbar-label-short { display: none; }
    .today-toolbar .today-workspace-views { box-shadow: inset 0 0 0 1px ${border}; }
    .today-priority-block { display: grid; gap: ${small}px; }
    .today-priority-block + .today-priority-block { margin-block-start: ${small}px; }
    .today-priority-block .today-priority-heading { display: flex; align-items: baseline; gap: ${small}px; margin: 0; font-size: ${fontSize.section}px; }
    .today-priority-heading > .ant-typography { font-size: ${fontSize.meta}px; font-weight: 500; }
    @container today-card (min-width: 50rem) {
      .today-workspace-results .today-work-card .today-plan-summary {
        display: grid;
        grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr);
        align-items: center;
        gap: ${regular}px;
      }
    }
    @container today-workspace (max-width: 28rem) {
      .today-workspace-scopes > .ant-btn { min-block-size: 44px; min-inline-size: 44px; block-size: auto; }
    }
    @container today-action (max-width: 26rem) {
      .today-toolbar-main, .today-toolbar-buttons { gap: ${tiny}px; }
      .today-toolbar-buttons > .ant-btn { min-block-size: 44px; min-inline-size: 44px; padding-inline: ${tiny}px; }
      .today-toolbar-buttons > .ant-btn .anticon, .today-workspace-views .ant-segmented-item-icon { display: none; }
      .today-toolbar .today-workspace-views .ant-segmented-item, .today-toolbar .today-workspace-views .ant-segmented-item-label { min-inline-size: 44px; }
      .today-toolbar .today-workspace-views .ant-segmented-item-label { display: grid; place-items: center; min-block-size: 44px; padding-inline: 2px; }
    }
    @container today-action (max-width: 20rem) {
      .today-toolbar-label-full { display: none; }
      .today-toolbar-label-short { display: inline; }
    }
  `;

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
