import { brand, fontSize, radius, rowComfort, space, statusColor, text } from '../../theme/tokens.js';

export const workspaceCalendarCss = `
  .today-workspace-calendar-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
    gap: ${space[3]}px;
  }
  @container today-action (min-inline-size: 62rem) {
    .today-workspace-calendar-layout { grid-template-columns: minmax(26rem, 2fr) minmax(0, 3fr); }
  }
  .today-workspace-calendar-layout > * { min-inline-size: 0; }
  .today-calendar-mobile { display: none; }
  .today-calendar-heading { min-block-size: 24px; }
  .today-calendar-heading h2.ant-typography { margin: 0; font-size: ${fontSize.section}px; }
  .today-calendar-result-heading { margin-block-end: ${space[1]}px; }
  .today-calendar-months { min-inline-size: 0; }
  .today-calendar-month-input { inline-size: 8.5rem; }
  .today-calendar-desktop:empty { display: none; }
  .today-calendar .today-calendar-input { inline-size: 9rem; max-inline-size: 100%; }
  .today-calendar .today-calendar-day {
    gap: ${space[0]}px;
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
    row-gap: 0;
    block-size: auto;
  }
  .today-calendar .today-calendar-day[aria-pressed="false"]:hover { background: ${statusColor.neutral.bg}; }
  .today-calendar .today-calendar-day[aria-pressed="true"] { background: ${brand[100]}; color: ${brand[800]}; font-weight: 600; }
  .today-calendar .today-calendar-day:focus-visible { outline: 2px solid ${brand[600]}; outline-offset: -2px; }
  .today-calendar-count { color: ${text.secondary}; font-size: ${fontSize.meta}px; white-space: nowrap; }
  .today-calendar-popup .today-calendar-count { display: block; line-height: 1.25; }
  .today-calendar-popup td:has(.today-calendar-count) { block-size: 42px; }
  .today-calendar-popup-header > button { min-inline-size: 28px; }
  @media (any-pointer: coarse) {
    .today-calendar-heading, .today-calendar-month-input { min-block-size: ${rowComfort}px; }
  }
  @container today-action (max-width: 36rem) {
    .today-workspace-calendar-layout { gap: ${space[1]}px; }
    .today-workspace-calendar-layout .today-calendar-desktop { display: none; }
    .today-calendar-mobile { display: block; }
    .today-workspace-calendar-layout > .ant-card { background: transparent; border: 0; }
    .today-workspace-calendar-layout > .ant-card > .ant-card-body { padding: 0; }
    .today-calendar .today-calendar-input { margin-inline-start: auto; min-block-size: ${rowComfort}px; }
    .today-calendar-result-heading { min-block-size: 0; margin-block-end: ${space[0]}px; }
    .today-calendar-result-heading:not(:has([role="status"])) { display: none; }
  }
`;
