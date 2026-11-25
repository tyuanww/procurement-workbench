import { Alert, Button, Collapse, Flex, Select, Skeleton } from 'antd';
import { MANAGEMENT_MEETING_STORES, ManagementMeetingSchema, type ManagementDecision, type ManagementMeeting, type ManagementMeetingStore } from '@sw/contracts';
import { businessDay, weekStart, type LocalDate } from '@sw/domain';
import { useEffect, useState } from 'react';
import { MEETING_PATH, MeetingDecisionEditor, meetingStoreLabels, type DecisionEditor } from '../../features/reporting/index.js';
import { useCan } from '../../shared/actor.js';
import { apiErrorMessage, apiGetWithSignal } from '../../shared/api/client.js';
import { businessTimeZone } from '../../shared/business-time-zone.js';
import { WorkbenchPage } from '../../shared/ui/page.js';
import { space } from '../../theme/tokens.js';
import { deliveryRisks, openDecisions, type EditDecision, type HomeEdit } from './director-home.js';
import { DirectorWorkBoard } from './DirectorWorkBoard.js';
import { DirectorPriority } from './DirectorPriority.js';
import { DirectorRiskBoard } from './DirectorRiskBoard.js';

type Scope = 'all' | ManagementMeetingStore;
const STORES: { value: Scope; label: string }[] = [
  { value: 'all', label: '全部店铺' },
  ...MANAGEMENT_MEETING_STORES.map((value) => ({ value, label: meetingStoreLabels[value] })),
];
type Load =
  | { readonly key: number; readonly kind: 'ready'; readonly meetings: readonly ManagementMeeting[] }
  | { readonly key: number; readonly kind: 'error'; readonly message: string };

function useDirectorMeetings(monday: LocalDate) {
  const [load, setLoad] = useState<Load>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(MANAGEMENT_MEETING_STORES.map((store) => {
      const params = new URLSearchParams({ store, weekStart: monday });
      return apiGetWithSignal({ path: `${MEETING_PATH}?${params}`, schema: ManagementMeetingSchema, signal: controller.signal });
    })).then(
      (meetings) => { if (!controller.signal.aborted) setLoad({ key: revision, kind: 'ready', meetings }); },
      (caught: unknown) => {
        if (!controller.signal.aborted) setLoad({ key: revision, kind: 'error', message: apiErrorMessage(caught) ?? '请检查连接后重试。' });
      },
    );
    return () => controller.abort();
  }, [monday, revision]);

  function applySavedDecision(decision: ManagementDecision) {
    setLoad((previous) => previous?.kind !== 'ready' ? previous : {
      ...previous,
      meetings: previous.meetings.map((meeting) => meeting.store !== decision.store ? meeting : {
        ...meeting, decisions: [decision, ...meeting.decisions.filter((row) => row.id !== decision.id)],
      }),
    });
  }
  return { load: load?.key === revision ? load : undefined, applySavedDecision, retry: () => setRevision((current) => current + 1) };
}

export function DirectorHomePage() {
  const [today] = useState(() => businessDay(new Date().toISOString(), businessTimeZone()));
  const [scope, setScope] = useState<Scope>('all');
  const [editing, setEditing] = useState<HomeEdit>();
  const [receipt, setReceipt] = useState<ManagementDecision>();
  const canWrite = useCan('reports.generate');
  const { load, applySavedDecision, retry } = useDirectorMeetings(weekStart(today));
  const startEdit = (editor: DecisionEditor, meeting: ManagementMeeting) => setEditing({ editor, meeting });
  return <WorkbenchPage title="首页">
    <Flex vertical gap={space[3]}>
      <Flex justify="space-between" align="center" wrap gap={space[2]}>
        <span>截至 {today}</span>
        <Select<Scope> aria-label="店铺范围" options={STORES} value={scope} onChange={setScope} style={{ minWidth: 148 }} />
      </Flex>
      <DirectorWorkBoard key={scope} scope={scope} today={today}>
        {load === undefined ? <Skeleton active paragraph={{ rows: 5 }} /> : load.kind === 'error'
          ? <Alert type="error" showIcon title="周会数据暂未读出" description={load.message}
            action={<Button onClick={retry}>重试</Button>} />
          : <DirectorHomeContent meetings={load.meetings} scope={scope} today={today}
            receipt={receipt} onEdit={canWrite ? startEdit : undefined} />}
      </DirectorWorkBoard>
      {editing === undefined ? null : <MeetingDecisionEditor {...editing} onClose={() => setEditing(undefined)} onSaved={(decision) => {
        applySavedDecision(decision);
        setReceipt(decision);
        setEditing(undefined);
      }} />}
    </Flex>
  </WorkbenchPage>;
}

function DirectorHomeContent({ meetings, scope, today, receipt, onEdit }: {
  readonly meetings: readonly ManagementMeeting[];
  readonly scope: Scope;
  readonly today: LocalDate;
  readonly receipt: ManagementDecision | undefined;
  readonly onEdit: EditDecision | undefined;
}) {
  const scoped = meetings.filter((meeting) => scope === 'all' || meeting.store === scope);
  const risks = deliveryRisks(scoped, today);
  return <>
    <DirectorPriority risks={risks} decisions={openDecisions(scoped)} today={today}
      receipt={receipt !== undefined && (scope === 'all' || receipt.store === scope) ? receipt : undefined} onEdit={onEdit} />
    <Collapse size="small" items={[{ key: 'batches', label: '按批次查看周会交付风险',
      children: <DirectorRiskBoard risks={risks} onEdit={onEdit} /> }]} />
  </>;
}
