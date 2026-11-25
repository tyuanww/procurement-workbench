export const projectStyles = `
.director-podium { display: flex; justify-content: center; align-items: flex-end; gap: 8px; }
.director-rank.ant-btn { display: flex; height: auto; flex: 1 1 0; flex-direction: column; align-items: center; gap: 2px; min-width: 0; padding: 4px 2px; cursor: pointer; background: transparent; border: 0; border-radius: 8px; color: inherit; font: inherit; }
.director-rank:hover, .director-rank:focus-visible { background: var(--ant-color-fill-quaternary); }
.director-rank.ant-btn[data-rank="1"] { padding-bottom: 12px; --medal: #c3902a; }
.director-rank.ant-btn[data-rank="2"] { --medal: #8693a1; }
.director-rank.ant-btn[data-rank="3"] { --medal: #b27751; }
.director-medal { position: relative; border: 2px solid var(--medal); border-radius: 50%; padding: 2px; margin-bottom: 4px; }
.director-rank-number { position: absolute; inset-inline: 0; bottom: -7px; margin: auto; width: 18px; line-height: 18px; border-radius: 50%; background: var(--medal); color: #151515; font-size: 12px; font-weight: 600; }
.director-rank-list { max-height: clamp(64px, calc(100dvh - 675px), 144px); overflow: auto; }
.director-rank-row.ant-btn { display: grid; grid-template-columns: 22px 24px minmax(0, 1fr) auto; align-items: center; gap: 8px; text-align: start; }
.director-rank-row:nth-child(odd) { background: var(--ant-color-fill-quaternary); }
.director-rank-name { overflow: hidden; text-overflow: ellipsis; }
.director-project-link.ant-btn { height: auto; padding: 0; white-space: normal; text-align: start; }
.director-caption.ant-typography { font-size: 12px; font-weight: 400; }
.director-project-focus { display: grid; gap: 3px; border-inline-start: 3px solid var(--ant-color-primary); padding: 5px 10px; background: var(--ant-color-fill-quaternary); }
.director-arrival-rows { display: grid; grid-template-columns: max-content minmax(32px, 1fr) 3ch; max-height: 104px; overflow: auto; }
.director-arrival-row.ant-btn { display: grid; grid-column: 1 / -1; grid-template-columns: subgrid; align-items: center; gap: 8px; text-align: start; height: 26px; padding-inline: 4px; font-variant-numeric: tabular-nums; }
.director-arrival-row > :last-child { text-align: end; }
.director-work-details { container-type: inline-size; }
.director-work-details .ant-card-head-title { white-space: normal; overflow: visible; }
.director-work-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; padding-block: 5px; }
.director-filters { flex: 1 1 auto; min-width: 0; font-weight: normal; }
.director-filters .ant-select { width: 126px; }
.director-work-search { display: flex; align-items: center; width: 32px; max-width: 100%; transition: width 150ms ease-out; }
.director-work-search[data-open="true"] { width: clamp(144px, 22cqi, 224px); }
.director-work-search .ant-input-affix-wrapper { min-width: 0; }
.director-work-search .ant-btn { flex-shrink: 0; }
@container (max-width: 630px) {
  .director-filters { flex-basis: 100%; }
}
@container (max-width: 420px) {
  .director-filters .ant-select { flex: 1 1 90px; width: auto; }
}
@media (max-width: 991px) {
  .director-board.ant-row { margin-inline: 0 !important; flex-direction: column; }
  .director-board > .ant-col, .director-board > .ant-col > .ant-flex { display: contents; }
  .director-board .director-development { order: -1; }
  .director-board .director-staff { order: 1; }
}
@media (prefers-reduced-motion: reduce) { .director-work-search { transition: none; } }
`;
