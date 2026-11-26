import { useEffect, useRef, type ReactNode } from 'react';
import { useInRouterContext, useNavigate } from 'react-router';
import { ProcurementCutoff } from '../../shared/ui/procurement-cutoff.js';
import { SectionTabs } from '../../shared/ui/view-switch.js';
import { arrivalShortcutPath, isPlanGroupMode, type TodayView } from '../../features/today/index.js';
import { screenView } from './today-session.js';

type TodaySection = TodayView | 'arrivals';

const sections = [
  { key: 'action', label: '行动板' },
  { key: 'arrivals', label: '在途待收' },
  { key: 'schedule', label: '今日排期' },
] satisfies readonly { readonly key: TodaySection; readonly label: string }[];

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
    items={sections.map((section) => ({ ...section, forceRender: true, children: section.key === view ? children : undefined }))}
    onChange={(next) => {
      const section = sections.find(({ key }) => key === next);
      if (section !== undefined) void navigate(sectionPath({ to: section.key, search }));
    }} /></div>;
}

function sectionPath({ to, search }: { readonly to: TodaySection; readonly search: string }): string {
  const action = actionSearch(search);
  for (const key of ['drawer', 'draft']) action.delete(key);
  if (to === 'action') return action.size === 0 ? '/today' : '/today?' + action;
  if (to === 'arrivals') return arrivalShortcutPath({ returnSearch: action.toString() });
  const schedule = new URLSearchParams({ group: 'schedule' });
  if (action.size > 0) schedule.set('workspaceReturn', action.toString());
  return '/today?' + schedule;
}

function actionSearch(search: string): URLSearchParams {
  let candidate = new URLSearchParams(search);
  while (true) {
    const { arrivalsView, group } = screenView(candidate);
    if (arrivalsView !== undefined) candidate = new URLSearchParams(candidate.get('actionReturn') ?? '');
    else if (isPlanGroupMode(group)) candidate = new URLSearchParams(candidate.get('workspaceReturn') ?? '');
    else return candidate;
  }
}
