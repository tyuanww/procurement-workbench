import { brand, fontSize, radius, rowComfort, space, statusColor, text } from '../../theme/tokens.js';

export const workspaceCalendarCss = `
  @container today-action (min-width: 62rem) {
    .today-workspace-calendar-layout .today-split > .ant-splitter-panel:first-child { padding-inline-end: ${space[1]}px; }
    .today-workspace-calendar-layout .today-split > .ant-splitter-panel:last-child { padding-inline-start: ${space[1]}px; }
  }
  @container today-action (max-width: 61.999rem) {
    .today-workspace-calendar-layout .today-split { flex-direction: column; gap: ${space[3]}px; }
    .today-workspace-calendar-layout .today-split > .ant-splitter-panel { flex: none !important; }
    .today-workspace-calendar-layout .today-split > .ant-splitter-bar { display: none; }
  }
  .today-calendar-cell { position: relative; border-radius: ${radius}px; }
  .today-calendar-mobile { display: none; }
  .today-calendar-heading { min-block-size: 24px; }
  .today-calendar-heading h2.ant-typography { margin: 0; font-size: ${fontSize.section}px; }
  .today-calendar-result-heading { margin-block-end: ${space[1]}px; }
  .today-calendar-months { min-inline-size: 0; }
  .today-calendar-month-input { inline-size: 8.5rem; }
  .today-calendar-desktop:empty { display: none; }
  .today-calendar .today-calendar-input { inline-size: 9rem; max-inline-size: 100%; }
  .today-calendar .today-calendar-day {
    gap: 0;
    inline-size: 100%;
    min-block-size: 28px;
    padding-inline: ${space[0]}px;
    border-radius: ${radius}px;
    color: inherit;
    font-variant-numeric: tabular-nums;
  }
  .today-calendar-day[data-calendar-date] {
    flex-wrap: wrap;
    align-content: center;
    flex-direction: column;
    row-gap: 0;
    block-size: auto;
  }
  .today-calendar .today-calendar-day[aria-pressed="false"]:hover { background: ${statusColor.neutral.bg}; }
  .today-calendar .today-calendar-day[aria-pressed="true"] { background: ${brand[100]}; color: ${brand[800]}; font-weight: 600; }
  .today-calendar .today-calendar-day:focus-visible { outline: 2px solid ${brand[600]}; outline-offset: -2px; }
  .today-calendar-count { color: ${text.secondary}; font-size: ${fontSize.meta}px; white-space: nowrap; }
  .today-calendar-count .ant-badge-status-text { font-size: inherit; margin-inline-start: ${space[0]}px; color: inherit; }
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
