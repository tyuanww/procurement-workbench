import { fontSize, space, text } from '../../theme/tokens.js';

const [tiny, small, medium, regular] = space;

export function todayRowCss(): string {
  return `
    .today-work-card { container: today-card / inline-size; }
    .today-kanban .today-row { max-inline-size: 49rem; }
    .today-batch-card > .ant-card-body { padding: ${small}px ${regular}px; }
    .today-row-layout, .today-row-facts, .today-row-details { display: grid; gap: ${tiny}px; min-inline-size: 0; }
    .today-row-layout { gap: ${small}px ${medium}px; align-items: center; }
    .today-row-facts .today-row-title { margin: 0; min-inline-size: 0; font-size: ${fontSize.body}px; line-height: 1.4; }
    .today-row-title > .ant-btn { max-inline-size: 100%; }
    .today-row-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 ${small}px; min-inline-size: 0; }
    .today-row-line:empty, .today-row-details:not(:has(.ant-typography)) { display: none; }
    .today-row-line .ant-tag { margin-inline-end: 0; }
    .today-batch-title { align-items: center; gap: ${tiny}px ${small}px; }
    .today-row-meta, .today-row-reminder .ant-typography { font-size: ${fontSize.meta}px; }
    .today-row-meta, .today-row-details { font-variant-numeric: tabular-nums; }
    .today-row-reason, .today-row-details .ant-typography { font-size: ${fontSize.table}px; }
    .today-row-delivery time { font-weight: 600; color: ${text.primary}; white-space: nowrap; }
    .today-row-quantities > .ant-typography { font-weight: 600; }
    .today-row-actions { min-inline-size: 0; justify-content: end; }
    .today-row-actions > :is(button, a) {
      display: inline-flex; align-items: center; justify-content: center;
      min-block-size: 32px; max-inline-size: 100%; block-size: auto;
      padding-inline: ${small}px; gap: ${tiny}px; white-space: normal;
    }
    .today-row-actions > .today-action-more { inline-size: 32px; padding-inline: 0; }
    ${responsiveRows}
  `;
}

const responsiveRows = `
    @container today-card (min-width: 35rem) {
      .today-row-layout { grid-template-columns: minmax(0, 1fr) minmax(8.5rem, .6fr) 10.5rem; }
      .today-row-details { grid-column: 2; }
      .today-row-quantities, .today-row-delivery { flex-direction: column; align-items: start; }
      .today-row-actions { grid-column: 3; }
      .today-list-panel .today-row-actions { justify-content: start; }
    }
    @container today-card (min-width: 46rem) {
      .today-list-panel .today-row-layout { grid-template-columns: minmax(0, 1fr) 12rem 10.5rem; }
      .today-list-panel .today-batch-card > .ant-card-body {
        display: grid; align-content: center; min-block-size: 76px;
      }
    }
    @container today-card (max-width: 34.999rem) {
      .today-batch-card > .ant-card-body { padding-inline: ${medium}px; }
      .today-row-layout { grid-template-columns: minmax(0, 1fr) auto; }
      .today-row-facts { grid-column: 1 / -1; }
      .today-row-actions { grid-column: 2; align-self: end; max-inline-size: 10.5rem; }
    }
    @container today-card (max-width: 23rem) {
      .today-row-layout { column-gap: ${small}px; }
      .today-row-layout .today-row-actions {
        flex-direction: column; align-items: end; gap: 0;
        inline-size: max-content; max-inline-size: 7.5rem;
      }
      .today-list-panel .today-row-layout { grid-template-columns: minmax(0, 1fr); row-gap: ${tiny}px; }
      .today-list-panel .today-row-layout .today-row-actions {
        grid-column: 1; flex-direction: row; align-items: center; justify-content: start;
        inline-size: 100%; max-inline-size: none; gap: ${tiny}px;
      }
    }
    @media (max-width: 520px), (any-pointer: coarse) {
      .today-row-actions > :is(button, a), .today-row-title > .ant-btn { min-block-size: 44px; min-inline-size: 44px; }
    }
  `;
