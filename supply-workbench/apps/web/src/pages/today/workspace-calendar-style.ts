import { brand, fontSize, radius, rowComfort, space, statusColor, text } from '../../theme/tokens.js';

export const workspaceCalendarCss = `
  .today-calendar { max-inline-size: 49rem; }
  .today-calendar-desktop:empty { display: none; }
  .today-calendar-tools { margin-block-end: ${space[0]}px; }
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
  .today-calendar .today-calendar-day[aria-pressed="false"]:hover { background: ${statusColor.neutral.bg}; }
  .today-calendar .today-calendar-day[aria-pressed="true"] { background: ${brand[100]}; color: ${brand[800]}; font-weight: 600; }
  .today-calendar .today-calendar-day:focus-visible { outline: 2px solid ${brand[600]}; outline-offset: -2px; }
  .today-calendar-count { color: ${text.secondary}; font-size: ${fontSize.meta}px; white-space: nowrap; }
  .today-calendar-popup .today-calendar-count { display: block; line-height: 1.25; }
  .today-calendar-popup td:has(.today-calendar-count) { block-size: 42px; }
  .today-calendar-popup-header > button { min-inline-size: 28px; }
  @container today-action (max-width: 36rem) {
    .today-calendar .today-calendar-desktop { display: none; }
    .today-calendar .today-calendar-tools { margin-block-end: 0; }
    .today-calendar .today-calendar-input { order: -1; min-block-size: ${rowComfort}px; }
  }
`;
