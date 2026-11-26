import type { CSSProperties } from 'react';
import { bg, border, brand, fontSize, radiusCard, space, statusColor, text, topBar } from '../../theme/tokens.js';
import type { RowFace } from './model/types.js';
import { workspaceAssistantCss } from './workspace-assistant-style.js';
import { todayRowCss } from './today-row-style.js';

const [tiny, small, medium, regular] = space;

export function screenStyle(): CSSProperties {
  return { display: 'flex', flexDirection: 'column', gap: `var(--today-workspace-gap, ${regular}px)`, background: bg.page };
}

export function todayMotionCss(): string {
  return `
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
    ${todayRowInteractionCss}
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
  `;
}

const todayRowInteractionCss = `
    .today-row { overflow-wrap: anywhere; }
    .today-row[data-fading="true"] { opacity: 0; }
    :is(.today-work-card, .today-task-row, .today-metric-card, .today-arrival-row)[data-current="true"],
    .today-list-panel .today-work-card[data-current="true"] { background-color: color-mix(in srgb, ${brand[100]} 40%, ${bg.surface}); }
    .today-action-list > [id^="today-row-"]:focus-visible {
      outline: 2px solid ${brand[600]}; outline-offset: -2px; border-radius: ${radiusCard}px;
    }
    @media (prefers-reduced-motion: no-preference) {
      .today-row { transition: opacity 180ms ease-out, background-color 150ms ease-out; }
    }
    @media (forced-colors: active) {
      :is(.today-work-card, .today-task-row, .today-metric-card, .today-arrival-row)[data-current="true"] { outline: 1px solid Highlight; outline-offset: -1px; }
    }
  `;

const todayWorkspaceCss = `
    .today-workspace-screen {
      container: today-workspace / inline-size;
      inline-size: 100%;
    }
    .today-workspace-intro { display: grid; gap: ${small}px; }
    .today-section-switch { row-gap: var(--today-workspace-gap, ${regular}px); }
    .today-section-header { display: flex; align-items: center; flex-wrap: wrap; gap: 0 ${small}px; border-block-end: 1px solid ${border}; }
    .today-section-switch .today-section-header > .today-section-tablist::before { content: none; }
    .today-section-switch .procurement-cutoff { font-size: ${fontSize.meta}px; }
    .today-section-tab [role="tab"] { display: grid; place-items: center; min-block-size: 44px; padding-inline: ${small}px; }
    .today-section-tab [role="tab"][aria-selected="true"] { color: ${brand[800]}; font-weight: 600; }
    .today-section-tab [role="tab"]:focus-visible { outline: 2px solid ${brand[600]}; outline-offset: -3px; }
    .today-section-switch .today-section-indicator { block-size: 0; border-block-end: 3px solid ${brand[600]}; }
    .today-section-panel[aria-hidden="false"] { display: flex; flex-direction: column; gap: var(--today-workspace-gap, ${regular}px); }
    .today-action-summary { --metric-padding: ${medium}px ${regular}px; --metric-height: 92px; }
    .today-action-summary .ant-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .today-metric-column { display: flex; min-inline-size: 0; }
    .today-metric-card { inline-size: 100%; }
    .today-metric-card .ant-btn {
      height: auto; padding: 0; border-radius: inherit; text-align: start; white-space: normal;
    }
    .today-metric-card .ant-btn:focus-visible { outline: 2px solid ${brand[600]}; outline-offset: -3px; }
    .today-metric-card .ant-btn > span { inline-size: 100%; }
    .today-metric-content {
      display: grid; align-content: center; gap: ${small}px;
      min-block-size: var(--metric-height); min-inline-size: 0; padding: var(--metric-padding);
    }
    .today-metric-label { display: flex; align-items: center; justify-content: space-between; color: ${text.secondary}; font-size: ${fontSize.meta}px; }
    .today-metric-card[data-current="true"] .today-metric-label { color: ${brand[800]}; font-weight: 600; }
    .today-metric-label > .anticon { font-size: ${tiny * 2}px; }
    .today-metric-value { font-size: ${fontSize.metric}px; line-height: 1.12; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .today-metric-value > span { font-size: ${fontSize.meta}px; font-weight: 400; margin-inline-start: ${tiny}px; }
    .today-split > .ant-splitter-panel { display: flex; overflow: visible; }
    .today-split-content { display: grid; min-inline-size: 0; inline-size: 100%; }
    .today-split-content > * { min-inline-size: 0; }
    .today-split-handle:focus-visible { outline: 2px solid ${brand[600]}; outline-offset: -2px; }
    @media (prefers-reduced-motion: no-preference) {
      .today-split:has(> .ant-splitter-bar > .today-split-handle:focus-visible):not(:has(> .ant-splitter-bar > .today-split-handle-dragging))
        > .ant-splitter-panel { transition: flex-basis 120ms ease-out; }
    }
    @container today-workspace (min-width: 56rem) {
      .today-actions-layout > .today-split > .ant-splitter-panel:has(~ .ant-splitter-panel) { padding-inline-end: ${small}px; }
      .today-actions-layout > .today-split > .ant-splitter-panel ~ .ant-splitter-panel { padding-inline-start: ${small}px; }
    }
    @container today-workspace (max-width: 55.999rem) {
      .today-actions-layout > .today-split { flex-direction: column; gap: ${regular}px; }
      .today-actions-layout > .today-split > .ant-splitter-panel { flex: none !important; }
      .today-actions-layout > .today-split > .ant-splitter-bar { display: none; }
    }
    .today-action-main { align-self: stretch; background: ${bg.surface}; border: 1px solid ${border}; border-radius: ${radiusCard}px; }
    .today-action-view-inset { padding: ${small}px; }
    .today-action-assistant-slot { display: grid; }
    .today-action-shortcuts { display: grid; }
    .today-action-shortcuts .ant-btn { text-align: start; justify-content: flex-start; block-size: auto; white-space: normal; }
    .today-batch-card, .today-batch-card > .ant-card-body { position: relative; }
    .today-batch-card > .ant-card-body { border-radius: inherit; }
    .today-row-beam-host { display: none; }
    @media (prefers-reduced-motion: no-preference) and (forced-colors: none) {
      .today-action-list > li:focus-within .today-row-beam-host { display: block; position: absolute; inset: 2px; border-radius: inherit; pointer-events: none; }
    }
    .today-list-panel .today-priority-list { gap: 0; }
    .today-list-panel .today-work-card { border-radius: 0; background: transparent; }
    .today-action-main > .today-touch:not(.today-toolbar), .today-list-panel .today-action-rows > nav,
    .today-list-panel .today-action-results-body > [role="status"] { padding: ${small}px ${regular}px; }
    .today-action-results-body > [role="status"] { display: block; }
    .today-list-panel .today-action-list > li:last-child .today-work-card { border-end-start-radius: ${radiusCard}px; border-end-end-radius: ${radiusCard}px; }
    .today-list-panel .ant-empty { padding: ${regular}px; }
    .today-list-panel .today-priority-list > li + li, .today-kanban .today-priority-list > li + li { border-block-start: 1px solid ${border}; }
    .today-list-panel .today-priority-list .today-work-card, .today-kanban .today-priority-list .today-work-card { border: 0; }
    .today-row-title > .ant-btn { color: inherit; padding: 0; block-size: auto; text-align: start; white-space: normal; font: inherit; }
    .today-row-title > .ant-btn:is(:hover, :focus-visible) { text-decoration: underline; }
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
      .today-action-summary { --metric-padding: ${small}px ${medium}px; --metric-height: 74px; }
      .today-metric-content { gap: ${tiny}px; }
      .today-toolbar { padding-inline: ${small}px; }
      .today-workspace-heading .ant-btn { min-block-size: 44px; }
    }
    @media (max-width: 22rem) {
      .today-workspace-screen { --today-workspace-gap: ${medium}px; }
    }
    @container today-action (max-width: 26rem) {
      .today-action-main > .today-touch:not(.today-toolbar), .today-action-view-inset { padding-block: 0; }
      .today-action-main > .today-touch:not(.today-toolbar) .ant-btn { min-block-size: 44px; }
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

    @container today-workspace (max-width: 22rem) {
      .today-procurement-summary { --metric-padding: ${tiny}px ${small}px; --metric-height: 46px; }
      .today-procurement-summary .today-metric-content {
        grid-template-columns: minmax(0, 1fr) fit-content(50%); align-items: center;
      }
      .today-procurement-summary .today-metric-label > .anticon { display: none; }
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
