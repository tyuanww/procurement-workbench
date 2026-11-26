import { useInRouterContext, useNavigate } from 'react-router';
import type { TodayView } from '../../features/today/index.js';
import { ViewSwitch } from '../../shared/ui/view-switch.js';

const sections: { readonly value: TodayView; readonly label: string }[] = [{ value: 'action', label: '行动板' }, { value: 'schedule', label: '今日排期' }];

export function TodaySectionNavigation(props: { readonly view: TodayView; readonly search: string }) {
  return useInRouterContext() ? <TodaySectionSwitch {...props} /> : null;
}

function TodaySectionSwitch({ view, search }: Parameters<typeof TodaySectionNavigation>[0]) {
  const navigate = useNavigate();
  return <div className="today-section-switch today-touch">
    <ViewSwitch<TodayView> aria-label="今日事项视图" value={view} options={sections} onChange={(next) => {
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
    }} />
  </div>;
}
