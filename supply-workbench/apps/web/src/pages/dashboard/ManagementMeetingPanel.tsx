import { Alert, Button, DatePicker, Flex, Select, Skeleton, Typography } from 'antd';
import {
  MANAGEMENT_MEETING_STORES, ManagementMeetingSchema, WeeklyReportSchema, type ManagementMeeting, type ManagementMeetingStore,
} from '@sw/contracts';
import { addDays, businessDay, parseLocalDate, weekStart, type LocalDate } from '@sw/domain';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { MeetingSections, meetingStoreLabels } from '../../features/reporting/index.js';
import { useCanWrite } from '../../shared/actor.js';
import { apiErrorMessage, apiGetWithSignal, apiSend } from '../../shared/api/client.js';
import { businessTimeZone } from '../../shared/business-time-zone.js';
import { space } from '../../theme/tokens.js';
import { MEETING_PATH, MeetingDecisionEditor, type DecisionEditor } from './meeting-decisions.js';

const STORES = MANAGEMENT_MEETING_STORES.map((value) => ({ value, label: meetingStoreLabels[value] }));
const WEEK_DAYS = 7;
type MeetingQuery = Pick<ManagementMeeting, 'store' | 'weekStart'>;
type Load = { readonly kind: 'loading' } | { readonly kind: 'error'; readonly message: string } | { readonly kind: 'ready'; readonly meeting: ManagementMeeting };

export function ManagementMeetingPanel({ now }: { readonly now: Date }) {
  const [params, setParams] = useSearchParams();
  const today = businessDay(now.toISOString(), businessTimeZone());
  const thisWeek = weekStart(today);
  const selected = queryOf(params, thisWeek);
  function update(patch: Partial<MeetingQuery>) {
    const next = { ...selected, ...patch };
    const search = new URLSearchParams(params);
    search.set('store', next.store);
    search.set('weekStart', next.weekStart);
    setParams(search);
  }
  return <Flex vertical gap={space[3]}>
    <MeetingFilters selected={selected} thisWeek={thisWeek} update={update} />
    <MeetingContent key={`${selected.store}/${selected.weekStart}`} selected={selected} />
  </Flex>;
}

function queryOf(params: URLSearchParams, thisWeek: LocalDate): MeetingQuery {
  const store = MANAGEMENT_MEETING_STORES.find((item) => item === params.get('store')) ?? 'dafuyan';
  const date = parseLocalDate(params.get('weekStart') ?? '');
  const selectedWeek = date.ok ? weekStart(date.value) : thisWeek;
  return { store, weekStart: selectedWeek <= thisWeek ? selectedWeek : thisWeek };
}

function MeetingFilters({ selected, update, thisWeek }: {
  readonly selected: MeetingQuery;
  readonly update: (patch: Partial<MeetingQuery>) => void;
  readonly thisWeek: LocalDate;
}) {
  return <Flex gap={space[2]} wrap align="center">
    <Select<ManagementMeetingStore> aria-label="店铺" value={selected.store} options={STORES} onChange={(store) => update({ store })} style={{ minWidth: 140 }} />
    <Button onClick={() => update({ weekStart: addDays(selected.weekStart, -WEEK_DAYS) })}>上周</Button>
    <DatePicker
      aria-label="周会日期" value={dayjs(selected.weekStart)} format="YYYY-MM-DD" allowClear={false}
      disabledDate={(date) => date.format('YYYY-MM-DD') > thisWeek}
      onChange={(date) => {
        const parsed = parseLocalDate(date?.format('YYYY-MM-DD') ?? '');
        if (parsed.ok) update({ weekStart: weekStart(parsed.value) });
      }}
    />
    <Button disabled={selected.weekStart >= thisWeek} onClick={() => update({ weekStart: addDays(selected.weekStart, WEEK_DAYS) })}>下周</Button>
    <Button href="/reports">查看历史周报</Button>
  </Flex>;
}

function MeetingContent({ selected }: { readonly selected: MeetingQuery }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [reload, setReload] = useState(0);
  const [editor, setEditor] = useState<DecisionEditor>();
  const canWrite = useCanWrite('reports.generate');
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ store: selected.store, weekStart: selected.weekStart });
    setLoad({ kind: 'loading' });
    apiGetWithSignal({ path: `${MEETING_PATH}?${params}`, schema: ManagementMeetingSchema, signal: controller.signal }).then(
      (meeting) => { if (!controller.signal.aborted) setLoad({ kind: 'ready', meeting }); },
      (error: unknown) => { if (!controller.signal.aborted) setLoad({ kind: 'error', message: apiErrorMessage(error) ?? '请检查连接后重试。' }); },
    );
    return () => controller.abort();
  }, [selected.store, selected.weekStart, reload]);
  if (load.kind === 'loading') return <Skeleton active paragraph={{ rows: 7 }} />;
  if (load.kind === 'error') return <Alert type="error" showIcon title="周会没有读出来" description={load.message} action={<Button onClick={() => setReload((version) => version + 1)}>重试</Button>} />;
  const { meeting } = load;
  return <>
    <Flex gap={space[2]} wrap align="center" justify="space-between">
      <Typography.Text>{meeting.weekStart} 至 {meeting.weekEnd} · 对照 {meeting.previousWeekStart} 起一周的最后承诺</Typography.Text>
      {canWrite ? <GenerateReport meeting={meeting} /> : null}
    </Flex>
    <MeetingSections meeting={meeting} {...(canWrite ? {
      onRecord: (material) => setEditor({ kind: 'record', material }),
      onComplete: (decision) => setEditor({ kind: 'complete', decision }),
    } : {})} />
    {editor === undefined ? null : <MeetingDecisionEditor editor={editor} meeting={meeting} onClose={() => setEditor(undefined)} onSaved={() => {
      setEditor(undefined);
      setReload((version) => version + 1);
    }} />}
  </>;
}

function GenerateReport({ meeting }: { readonly meeting: ManagementMeeting }) {
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function generate() {
    setPending(true);
    setError(undefined);
    try {
      const report = await apiSend({ path: '/api/v1/reports/weekly', method: 'POST', body: { weekStart: meeting.weekStart }, schema: WeeklyReportSchema });
      window.location.assign(`/reports/${encodeURIComponent(report.id)}`);
    } catch (caught: unknown) {
      setError(apiErrorMessage(caught) ?? '周报没有生成，请重试。');
    } finally {
      setPending(false);
    }
  }
  return <Flex gap={space[1]} wrap align="center">
    {error === undefined ? null : <Alert type="error" showIcon title={error} />}
    <Button type="primary" loading={isPending} onClick={() => void generate()}>生成周报</Button>
  </Flex>;
}
