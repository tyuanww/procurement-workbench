import { useId, type ReactNode } from 'react';
import { useInRouterContext, useNavigate } from 'react-router';
import { ProcurementCutoff } from '../../shared/ui/procurement-cutoff.js';
import { ContentTabs } from '../../shared/ui/view-switch.js';
import type { TodayView } from '../../features/today/index.js';

const sections = [
  { key: 'action', label: '行动板' },
  { key: 'schedule', label: '今日排期' },
] satisfies readonly { readonly key: TodayView; readonly label: string }[];

export function TodaySectionNavigation(props: { readonly view: TodayView; readonly search: string; readonly children: ReactNode }) {
  return useInRouterContext() ? <TodaySectionTabs {...props} /> : props.children;
}

function TodaySectionTabs({ view, search, children }: Parameters<typeof TodaySectionNavigation>[0]) {
  const id = useId();
  const navigate = useNavigate();
  return <ContentTabs id={id} aria-label="今日事项视图" className="today-section-switch" activeKey={view} animated={false} tabBarGutter={16}
    classNames={{ header: 'today-section-tablist', item: 'today-section-tab', indicator: 'today-section-indicator', content: 'today-section-panel' }}
    styles={{ header: { flex: '1 1 9.5rem', minInlineSize: 'min(100%, 9.5rem)', margin: 0 }, item: { padding: 0 } }}
    items={sections.map((section) => ({ ...section, forceRender: true, children: section.key === view ? children : undefined }))}
    renderTabBar={(props, DefaultTabBar) => <div className="today-section-header">
      <DefaultTabBar {...props} />
      <ProcurementCutoff />
    </div>}
    onChange={(next) => {
      const current = new URLSearchParams(search);
      if (next === 'action') {
        const back = new URLSearchParams(current.get('workspaceReturn') ?? '');
        void navigate(back.size === 0 ? '/today' : '/today?' + back);
        return;
      }
      const target = new URLSearchParams({ group: 'schedule' });
      for (const key of ['drawer', 'draft']) current.delete(key);
      if (current.size > 0) target.set('workspaceReturn', current.toString());
      void navigate('/today?' + target);
    }} />;
}
