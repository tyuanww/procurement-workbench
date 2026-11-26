import { fontSize, space } from '../../theme/tokens.js';

export function todayRowCss(): string {
  const [tiny, small, medium] = space;
  return `
    .today-work-card { container: today-card / inline-size; }
    .today-priority-list .today-row { max-inline-size: 49rem; }
    .today-row-layout { display: grid; gap: ${small}px; }
    .today-row-facts { display: grid; gap: ${tiny}px; min-inline-size: 0; }
    .today-row-facts .today-row-title { margin: 0; font-size: ${fontSize.body}px; line-height: 1.4; }
    .today-row-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 ${small}px; min-inline-size: 0; }
    .today-row-line:empty { display: none; }
    .today-row-line .ant-tag { margin-inline-end: 0; }
    .today-row-quantities { font-variant-numeric: tabular-nums; font-weight: 600; }
    .today-batch-card .today-batch-title { align-items: center; row-gap: ${tiny}px; }
    .today-batch-card .today-batch-meta { font-size: ${fontSize.meta}px; }
    .today-batch-card .today-row-facts > :not(.today-batch-title) { font-size: ${fontSize.table}px; }
    .today-row-actions { min-inline-size: 0; }
    .today-row-actions > :is(button, a) {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-block-size: 32px;
      max-inline-size: 100%;
      padding-inline: ${tiny}px;
      gap: ${tiny}px;
      white-space: normal;
    }
    .today-row-actions > .today-action-primary { inline-size: 8rem; }
    @container today-card (min-width: 40rem) {
      .today-row-layout { grid-template-columns: minmax(0, 23rem) minmax(16.5rem, 1fr); align-items: center; }
    }
    @media (max-width: 520px), (any-pointer: coarse) {
      .today-row-actions > :is(button, a) { min-block-size: 44px; min-inline-size: 44px; }
    }
    @media (max-width: 520px) {
      .today-batch-card > .ant-card-body { padding: ${small}px ${medium}px; }
    }
  `;
}
