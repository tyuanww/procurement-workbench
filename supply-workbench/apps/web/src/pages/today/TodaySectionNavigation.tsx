import { useEffect, useRef, type ReactNode } from 'react';
import { useInRouterContext, useNavigate } from 'react-router';
import { ProcurementCutoff } from '../../shared/ui/procurement-cutoff.js';
import { SectionTabs } from '../../shared/ui/view-switch.js';
import { todaySectionPath, todaySections, type TodaySection } from './today-section-navigation.js';

export function TodaySectionNavigation(props: { readonly view: TodaySection; readonly search: string; readonly children: ReactNode }) {
  return useInRouterContext() ? <TodaySectionTabs {...props} /> : props.children;
}

function TodaySectionTabs({ view, search, children }: Parameters<typeof TodaySectionNavigation>[0]) {
  const navigate = useNavigate();
  const root = useRef<HTMLDivElement>(null);
  const previous = useRef(view);
  useEffect(() => {
    const hasChanged = previous.current !== view;
    previous.current = view;
    const document = root.current?.ownerDocument;
    if (hasChanged && document !== undefined && document.activeElement === document.body) {
      root.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    }
  }, [view]);
  return <div ref={root}><SectionTabs aria-label="今日事项视图" className="today-section-switch" activeKey={view} extra={<ProcurementCutoff />}
    items={todaySections.map(({ key, label }) => ({ key, label, forceRender: true, children: key === view ? children : undefined }))}
    onChange={(next) => {
      const section = todaySections.find(({ key }) => key === next);
      if (section !== undefined) void navigate(todaySectionPath({ to: section.key, search }));
    }} /></div>;
}
