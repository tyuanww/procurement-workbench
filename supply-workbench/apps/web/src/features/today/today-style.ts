import type { CSSProperties } from 'react';
import { bg, border, brand, fontSize, radiusCard, space, statusColor, text, topBar } from '../../theme/tokens.js';
import type { RowFace } from './model/types.js';
import { workspaceAssistantCss } from './workspace-assistant-style.js';
import { todayRowCss } from './today-row-style.js';

const [tiny, small, medium, regular] = space;

export function screenStyle(): CSSProperties {
  return { display: 'flex', flexDirection: 'column', gap: `var(--today-workspace-gap, ${regular}px)`, background: bg.page };
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
    ${workspaceAssistantCss}
    .today-jump-target { scroll-margin-block-start: ${topBar + regular}px; }
    .today-touch .ant-select { max-inline-size: 100%; }
    #today-chase { container: today-action / inline-size; }
    @container today-action (min-width: 60rem) {
      .today-kanban { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .today-kanban-lane[data-active="false"] { display: flex; }
      .today-lane-links { display: none; }
      .today-kanban-lane .today-lane-heading { display: flex; }
    }
    @media (max-width: 520px), (any-pointer: coarse) {
      .today-workspace-menu .ant-dropdown-menu-item { min-block-size: 44px; }
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
    }
    .today-workspace-intro { display: grid; gap: ${small}px; }
    .today-section-switch { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: ${small}px; border-block-end: 1px solid ${border}; }
    .today-section-switch .procurement-cutoff { font-size: ${fontSize.meta}px; }
    .today-section-switch .ant-segmented { background: transparent; padding: 0; }
    .today-section-switch .ant-segmented-group { gap: ${regular}px; }
    .today-section-switch .ant-segmented-thumb { display: none; }
    .today-section-switch .ant-segmented-item { border-radius: 0; border-block-end: 2px solid transparent; }
    .today-section-switch .ant-segmented-item-selected { background: transparent; box-shadow: none; border-color: ${brand[600]}; color: ${brand[800]}; font-weight: 600; }
    .today-section-switch .ant-segmented-item-label { display: grid; place-items: center; min-block-size: 40px; padding-inline: 0; }
    .today-action-summary { --metric-padding: ${medium}px ${regular}px; }
    .today-action-summary .ant-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .today-action-summary .ant-btn, .today-action-summary .ant-card { border-radius: ${radiusCard}px; min-block-size: 92px; }
    .today-action-summary .ant-btn > span { gap: ${small}px; }
    .today-action-summary .ant-btn > span > span:first-child { display: flex; align-items: center; justify-content: space-between; }
    .today-action-summary .ant-btn[aria-pressed="true"] > span > span:first-child { font-weight: 600; }
    .today-action-summary .ant-btn .anticon-check { display: none; }
    .today-action-summary .ant-btn > span > span:first-child::after { content: ''; inline-size: 5px; block-size: 5px; margin-inline-end: ${tiny}px; border-block-start: 1px solid currentColor; border-inline-end: 1px solid currentColor; transform: rotate(45deg); }
    .today-action-summary strong > span { font-weight: 400; margin-inline-start: ${tiny}px; }
    .today-action-summary .ant-btn > span > strong { line-height: 1.12; }
    .today-actions-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: ${regular}px; align-items: stretch; }
    .today-actions-layout > *, .today-action-shortcuts { min-inline-size: 0; }
    .today-action-main { border: 1px solid transparent; }
    .today-action-shortcuts { display: grid; }
    .today-action-shortcuts .ant-btn { text-align: start; justify-content: flex-start; block-size: auto; white-space: normal; }
    .today-list-panel { align-self: stretch; background: ${bg.surface}; border: 1px solid ${border}; border-radius: ${radiusCard}px; }
    .today-list-panel .today-priority-list { gap: 0; }
    .today-list-panel .today-work-card { border-radius: 0; background: transparent; }
    .today-list-panel > .today-touch:not(.today-toolbar), .today-list-panel .today-action-results-body > nav { padding: ${small}px ${regular}px; }
    .today-list-panel .today-action-list > li:last-child .today-work-card { border-end-start-radius: ${radiusCard}px; border-end-end-radius: ${radiusCard}px; }
    .today-list-panel .ant-empty { padding: ${regular}px; }
    .today-list-panel .today-priority-list > li + li, .today-kanban .today-priority-list > li + li { border-block-start: 1px solid ${border}; }
    .today-list-panel .today-priority-list .today-work-card, .today-kanban .today-priority-list .today-work-card { border: 0; }
    .today-row-title > .ant-btn { color: inherit; padding: 0; block-size: auto; text-align: start; white-space: normal; font: inherit; }
    .today-row-title > .ant-btn:is(:hover, :focus-visible) { text-decoration: underline; }
    @container today-workspace (min-width: 56rem) {
      .today-actions-layout:has(> .today-action-shortcuts) { grid-template-columns: minmax(0, 1fr) minmax(15.5rem, 18.5rem); }
    }
    .today-workspace-heading { display: flex; align-items: center; flex-wrap: wrap; gap: ${small}px; }
    .today-workspace-heading > .ant-typography { margin: 0; font-size: ${fontSize.section}px; }
    .today-workspace-heading h2 .ant-btn { font: inherit; padding-inline: 0 ${small}px; gap: ${small}px; }
    .today-workspace-heading .anticon { font-size: ${fontSize.meta}px; color: ${text.secondary}; }
    .today-review-scope { display: flex; gap: ${small}px; align-items: center; flex-wrap: wrap; }
    .today-toolbar { justify-content: space-between; min-block-size: 56px; padding: ${small}px ${regular}px; border-block-end: 1px solid ${border}; }
    .today-toolbar-main { min-inline-size: 0; }
    .today-toolbar-compact, .today-scope-short { display: none; }
    .today-toolbar .today-workspace-views { box-shadow: inset 0 0 0 1px ${border}; }
    @container today-card (min-width: 50rem) {
      .today-workspace-results .today-work-card .today-plan-summary {
        display: grid;
        grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr);
        align-items: center;
        gap: ${regular}px;
      }
    }
    @container today-workspace (max-width: 37.5rem) {
      .today-action-summary .ant-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .today-action-summary { --metric-padding: ${small}px ${medium}px; }
      .today-action-summary .ant-btn, .today-action-summary .ant-card { min-block-size: 76px; }
      .today-action-summary .ant-btn > span { gap: ${tiny}px; }
      .today-toolbar { padding-inline: ${small}px; }
      .today-workspace-heading .ant-btn { min-block-size: 44px; }
    }
    @media (max-width: 22rem) {
      .today-workspace-screen { --today-workspace-gap: ${medium}px; }
    }
    @container today-action (max-width: 26rem) {
      .today-list-panel > .today-touch:not(.today-toolbar) { padding-block: 0; }
      .today-list-panel > .today-touch:not(.today-toolbar) .ant-btn { min-block-size: 44px; }
      .today-toolbar { column-gap: ${tiny}px; }
      .today-toolbar-context, .today-toolbar-main { gap: ${tiny}px; }
      .today-toolbar-compact { display: inline-flex; padding-inline: ${tiny}px; min-block-size: 44px; min-inline-size: 44px; }
      .today-scope-short { display: inline; }
      .today-toolbar .today-toolbar-buttons, .today-toolbar .today-priority-switch, .today-scope-full { display: none; }
      .today-workspace-heading h2 .ant-btn { gap: ${tiny}px; padding-inline: 0; }

      .today-workspace-views .ant-segmented-item-icon { display: none; }
      .today-toolbar .today-workspace-views .ant-segmented-item, .today-toolbar .today-workspace-views .ant-segmented-item-label { min-inline-size: 44px; }
      .today-toolbar .today-workspace-views .ant-segmented-item-label { display: grid; place-items: center; min-block-size: 44px; padding-inline: 2px; }
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
