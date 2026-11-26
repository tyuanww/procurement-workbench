import { border, brand, fontSize, rowComfort, space, statusColor, text } from '../../theme/tokens.js';

export const workspaceCalendarCss = `
  @container today-action (min-width: 62rem) {
    .today-workspace-calendar-layout .today-split > .ant-splitter-panel:has(~ .ant-splitter-panel) { padding-inline-end: ${space[1]}px; }
    .today-workspace-calendar-layout .today-split > .ant-splitter-panel ~ .ant-splitter-panel { padding-inline-start: ${space[1]}px; }
  }
  @container today-action (max-width: 61.999rem) {
    .today-workspace-calendar-layout .today-split { flex-direction: column; gap: ${space[3]}px; }
    .today-workspace-calendar-layout .today-split > .ant-splitter-panel { flex: none !important; }
    .today-workspace-calendar-layout .today-split > .ant-splitter-bar { display: none; }
  }
  .today-calendar-mobile { display: none; }
  .today-calendar-heading { min-block-size: 24px; }
  .today-calendar-heading h2.ant-typography { margin: 0; font-size: ${fontSize.section}px; }
  .today-calendar-result-heading { margin-block-end: ${space[1]}px; }
  .today-calendar-months { min-inline-size: 0; margin-inline-start: auto; justify-content: flex-end; }
  .today-calendar-month-input { inline-size: 7rem; }
  .today-calendar :is(.ant-picker-calendar-full, .ant-picker-calendar-full .ant-picker-content) { inline-size: 100%; }
  .today-calendar .ant-picker-calendar-full .ant-picker-content { table-layout: fixed; }
  .today-calendar .ant-picker-calendar-full .ant-picker-content td { vertical-align: top; }
  .today-calendar .today-calendar-input { inline-size: 9rem; max-inline-size: 100%; }
  .today-calendar .today-calendar-cell {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: stretch;
    gap: ${space[0]}px;
    inline-size: calc(100% - 2px);
    min-block-size: 76px;
    block-size: auto;
    margin-inline: 1px;
    padding: ${space[0]}px;
    border: 0;
    border-block-start: 2px solid ${border};
    border-radius: 0;
    color: inherit;
    white-space: normal;
    text-align: start;
    font-variant-numeric: tabular-nums;
  }
  .today-calendar .today-calendar-day { min-block-size: 64px; }
  .today-calendar-value { text-align: end; }
  .today-calendar .today-calendar-cell:hover { background: ${statusColor.neutral.bg}; }
  .today-calendar .today-calendar-cell:is([aria-pressed="true"], [data-calendar-current="true"]) {
    background: ${brand[100]}; color: ${brand[800]}; border-block-start-color: ${brand[600]}; font-weight: 600;
  }
  .today-calendar .today-calendar-cell:focus-visible { outline: 2px solid ${brand[600]}; outline-offset: -2px; }
  .today-calendar .ant-picker-cell:not(.ant-picker-cell-in-view) .today-calendar-value { color: ${text.secondary}; }
  .today-calendar-notices { display: grid; gap: ${space[0]}px; }
  .today-calendar .today-calendar-notices .ant-badge-status { display: flex; align-items: baseline; gap: ${space[0]}px; }
  .today-calendar-notices .ant-badge-status-dot { flex: none; }
  .today-calendar .today-calendar-notices .ant-badge-status-text {
    min-inline-size: 0; margin-inline-start: 0; color: inherit; font-size: ${fontSize.meta}px; line-height: 1.4;
    word-break: keep-all; overflow-wrap: anywhere;
  }
  .today-calendar-count { color: ${text.secondary}; font-size: ${fontSize.meta}px; white-space: nowrap; }
  .today-calendar-popup .today-calendar-count { display: block; line-height: 1.25; }
  .today-calendar-popup td:has(.today-calendar-count) { block-size: 42px; }
  .today-calendar-popup-header > button { min-inline-size: 28px; }
  @media (any-pointer: coarse) {
    .today-calendar-heading, .today-calendar-month-input { min-block-size: ${rowComfort}px; }
  }
  @container today-action (max-width: 36rem) {
    .today-workspace-calendar-layout .today-split { gap: ${space[1]}px; }
    .today-workspace-calendar-layout .today-calendar-desktop { display: none; }
    .today-calendar-mobile { display: block; }
    .today-workspace-calendar-layout .today-split-content > .ant-card { background: transparent; border: 0; }
    .today-workspace-calendar-layout .today-split-content > .ant-card > .ant-card-body { padding: 0; }
    .today-calendar .today-calendar-input { margin-inline-start: auto; min-block-size: ${rowComfort}px; }
    .today-calendar-result-heading { min-block-size: 0; margin-block-end: ${space[0]}px; }
    .today-calendar-result-heading:not(:has([role="status"])) { display: none; }
  }
`;
