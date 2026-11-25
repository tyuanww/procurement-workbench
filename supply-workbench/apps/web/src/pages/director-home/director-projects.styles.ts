export const projectStyles = `
.director-podium { display: flex; justify-content: center; align-items: flex-end; gap: 8px; }
.director-rank.ant-btn { display: flex; height: auto; flex: 1 1 0; flex-direction: column; align-items: center; gap: 6px; min-width: 0; padding: 8px 2px; cursor: pointer; background: transparent; border: 0; border-radius: 8px; color: inherit; font: inherit; }
.director-rank:hover, .director-rank:focus-visible { background: var(--ant-color-fill-quaternary); }
.director-rank.ant-btn[data-rank="1"] { padding-bottom: 18px; --medal: #c3902a; }
.director-rank.ant-btn[data-rank="2"] { --medal: #8693a1; }
.director-rank.ant-btn[data-rank="3"] { --medal: #b27751; }
.director-medal { position: relative; border: 2px solid var(--medal); border-radius: 50%; padding: 2px; margin-bottom: 4px; }
.director-rank-number { position: absolute; inset-inline: 0; bottom: -7px; margin: auto; width: 18px; line-height: 18px; border-radius: 50%; background: var(--medal); color: #151515; font-size: 12px; font-weight: 600; }
.director-rank-list { max-height: 196px; overflow: auto; }
.director-rank-row.ant-btn { display: grid; grid-template-columns: 22px 24px minmax(0, 1fr) auto; align-items: center; gap: 8px; text-align: start; }
.director-rank-row:nth-child(odd) { background: var(--ant-color-fill-quaternary); }
.director-rank-name { overflow: hidden; text-overflow: ellipsis; }
.director-project-link.ant-btn { height: auto; padding: 0; white-space: normal; text-align: start; }

`;
