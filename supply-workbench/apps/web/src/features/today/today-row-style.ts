import { fontSize, space } from '../../theme/tokens.js';

export function todayBatchCardCss(): string {
  const [tiny, small, medium] = space;
  return `
    .today-batch-card .today-row-facts { gap: ${tiny}px; }
    .today-batch-card .today-row-facts .today-row-title { font-size: ${fontSize.body}px; }
    .today-batch-card .today-row-line { gap: 0 ${small}px; }
    .today-batch-card .today-batch-title { align-items: center; row-gap: ${tiny}px; }
    .today-batch-card .today-batch-meta { font-size: ${fontSize.meta}px; }
    .today-batch-card .today-row-facts > :not(.today-batch-title) { font-size: ${fontSize.table}px; }
    .today-batch-card .today-row-actions {
      display: grid;
      grid-template-columns: minmax(0, 7.75rem) max-content max-content;
      justify-content: start;
    }
    .today-batch-card .today-row-actions > .ant-btn {
      grid-row: 1;
      min-block-size: 32px;
      padding-inline: ${tiny}px;
    }
    .today-batch-card .today-row-actions > .ant-btn-primary { grid-column: 1; }
    .today-batch-card .today-row-actions > .today-action-detail:not(.ant-btn-primary) { grid-column: 2; }
    .today-batch-card .today-row-actions > .today-action-more { grid-column: 3; }
    @container today-card (min-width: 44rem) {
      .today-batch-card .today-row-actions { grid-template-columns: 8rem 4.75rem 4.25rem; }
    }
    @media (max-width: 520px) {
      .today-batch-card > .ant-card-body { padding: ${small}px ${medium}px; }
      .today-batch-card .today-row-actions > .ant-btn { min-block-size: 44px; min-inline-size: 44px; }
    }
  `;
}
