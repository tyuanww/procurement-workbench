import { bg, border, brand, fontSize, radiusCard, rowComfort, space } from '../../theme/tokens.js';

export const taskStyles = `
  .personal-task-panel {
    container: personal-tasks / inline-size;
    min-inline-size: 0;
  }
  .personal-task-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: ${space[1]}px ${space[2]}px;
  }
  .personal-task-heading { grid-area: heading; }
  .personal-task-views { grid-area: views; min-inline-size: 0; }
  .personal-task-filters { grid-area: filters; flex: 1 1 auto; min-inline-size: 0; }
  .personal-task-label {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .personal-task-filters .ant-select { min-inline-size: 7.5rem; max-inline-size: 100%; }
  .personal-task-date-filter { inline-size: 8.5rem; max-inline-size: 100%; }
  .personal-task-link.ant-btn {
    display: inline-block;
    block-size: auto;
    min-inline-size: 0;
    max-inline-size: 100%;
    padding: 0;
    text-align: start;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .personal-task-summary { max-inline-size: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .personal-task-panel .ant-table-tbody .ant-table-cell-row-scope { background: ${bg.surface}; }
  .personal-task-due { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .personal-task-board {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: ${space[2]}px;
  }
  .personal-task-lane {
    display: grid;
    min-inline-size: 0;
    min-block-size: 5rem;
    align-content: start;
    gap: ${space[1]}px;
    padding: ${space[2]}px;
    background: ${bg.page};
    border: 1px solid ${border};
    border-radius: ${radiusCard}px;
  }
  .personal-task-lane-title .ant-typography { font-size: ${fontSize.meta}px; font-variant-numeric: tabular-nums; }
  .personal-task-board-card.ant-btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: ${space[0]}px;
    inline-size: 100%;
    min-inline-size: 0;
    block-size: auto;
    padding: ${space[1]}px ${space[2]}px;
    border-color: ${border};
    border-radius: ${radiusCard}px;
    text-align: start;
    white-space: normal;
  }
  .personal-task-board-card.ant-btn:is(:hover, :active) { border-color: ${brand[600]}; }
  .personal-task-board-card .ant-tag { margin-inline-end: 0; }
  .personal-task-card-title { max-inline-size: 100%; font-weight: 600; overflow-wrap: anywhere; }
  .personal-task-card-date { font-size: ${fontSize.meta}px; }
  .personal-task-items { display: grid; gap: ${space[1]}px; list-style: none; margin: 0; padding: 0; }
  .personal-task-calendar-grid .ant-picker-calendar-date { block-size: auto; min-block-size: 6rem; }
  .personal-task-calendar-grid .ant-picker-calendar-date-content { block-size: auto; overflow: visible; }
  .personal-task-calendar-grid .personal-task-items { gap: ${space[0]}px; }
  .personal-task-calendar-entry { display: flex; align-items: center; gap: ${space[0]}px; min-inline-size: 0; }
  .personal-task-calendar-entry > .anticon { flex: none; }
  .personal-task-link-compact.ant-btn {
    font-size: ${fontSize.meta}px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .personal-task-calendar-agenda { display: none; }
  .personal-task-agenda-day {
    display: grid;
    gap: ${space[1]}px;
    border-block-start: 1px solid ${border};
    padding-block: ${space[1]}px;
  }
  @container personal-tasks (width < 42rem) {
    .personal-task-board { grid-template-columns: minmax(0, 1fr); }
    .personal-task-calendar-grid { display: none; }
    .personal-task-calendar-agenda { display: block; }
  }
  @container personal-tasks (width < 36rem) {
    .personal-task-toolbar {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-areas: "heading views" "filters filters";
    }
  }
  @container personal-tasks (width < 22rem) {
    .personal-task-toolbar {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: "heading" "views" "filters";
    }
    .personal-task-date-filter { inline-size: 7.75rem; }
  }
  @media (any-pointer: coarse) {
    .personal-task-panel .ant-btn, .personal-task-panel .ant-segmented-item-label,
    .personal-task-panel .ant-select, .personal-task-panel .ant-picker {
      min-block-size: ${rowComfort}px;
    }
    .personal-task-panel .ant-segmented-item-label { display: flex; align-items: center; justify-content: center; }
    .personal-task-link.ant-btn { display: inline-flex; align-items: center; }
  }
`;
