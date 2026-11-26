import { fontSize, space } from '../../theme/tokens.js';

const [tiny, small, medium, regular] = space;

export function todayRowCss(): string {
  return `
    .today-work-card { container: today-card / inline-size; }
    .today-kanban .today-row { max-inline-size: 49rem; }
    .today-row-layout { display: grid; gap: ${small}px; }
    .today-row-facts { display: grid; gap: ${tiny}px; min-inline-size: 0; }
    .today-row-facts .today-row-title { margin: 0; font-size: ${fontSize.body}px; line-height: 1.4; }
    .today-row-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 ${small}px; min-inline-size: 0; }
    .today-row-line:empty { display: none; }
    .today-row-line .ant-tag { margin-inline-end: 0; }
    .today-row-quantities { font-variant-numeric: tabular-nums; font-weight: 600; }
    .today-batch-card .today-batch-title { align-items: center; row-gap: ${tiny}px; }
    .today-row-status { display: contents; }
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
    ${workspaceRowCss()}
    @media (max-width: 520px), (any-pointer: coarse) {
      .today-row-actions > :is(button, a) { min-block-size: 44px; min-inline-size: 44px; }
    }
    @media (max-width: 520px) {
      .today-batch-card > .ant-card-body { padding: ${small}px ${medium}px; }
    }
  `;
}

function workspaceRowCss(): string {
  return `
    @container today-card (min-width: 50rem) {
      .today-workspace-results .today-row-layout {
        grid-template-columns: minmax(0, 1fr) 16.5rem;
        column-gap: ${regular}px;
      }
      .today-workspace-results .today-batch-card .today-row-facts {
        grid-template-columns: minmax(0, 1fr) minmax(9rem, 1.25fr) minmax(6.5rem, .75fr);
        grid-template-areas:
          "title status quantities"
          "batch delivery quantities"
          "batch reminder quantities";
        column-gap: ${medium}px;
        row-gap: 0;
        align-items: start;
      }
      .today-workspace-results .today-batch-title { display: contents; }
      .today-workspace-results .today-row-title { grid-area: title; }
      .today-workspace-results .today-row-batch { grid-area: batch; padding-block-start: ${tiny}px; }
      .today-workspace-results .today-row-status { grid-area: status; display: flex; align-items: center; }
      .today-workspace-results .today-row-delivery { grid-area: delivery; padding-block-start: ${tiny}px; }
      .today-workspace-results .today-row-reminder { grid-area: reminder; padding-block-start: ${tiny}px; }
      .today-workspace-results .today-row-quantities {
        grid-area: quantities;
        align-self: center;
        flex-direction: column;
        align-items: flex-end;
        text-align: end;
      }
    }
  `;
}
