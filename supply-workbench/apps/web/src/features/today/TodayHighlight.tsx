import { BorderBeam } from 'antd';
import { brand } from '../../theme/tokens.js';

export function TodayHighlight({ active }: { readonly active: boolean }) {
  if (!active) return null;
  return <BorderBeam className="today-highlight-beam" color={brand[600]} duration={2.4} outset={0}>
    <div className="today-highlight-host" aria-hidden="true" />
  </BorderBeam>;
}

export const todayHighlightCss = `
  .today-work-card, .today-task-row, .today-metric-card, .today-arrival-row { position: relative; }
  .today-highlight-host { display: none; }
  @media (prefers-reduced-motion: no-preference) and (forced-colors: none) {
    .today-highlight-host { display: block; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; }
    .ant-border-beam.today-highlight-beam::before { animation-iteration-count: 1; }
  }
`;
