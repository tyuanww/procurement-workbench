import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Alert, Button, Empty, Flex, Form, Input, Result, Skeleton, Typography } from 'antd';
import { FeishuPublishResultSchema, WeeklyReportDetailSchema, WeeklyReportListItemSchema, WeeklyReportSchema, listResponseSchema, type WeeklyReport, type WeeklyReportDetail, type WeeklyReportListItem } from '@sw/contracts';
import { apiDownload, apiErrorMessage, apiGet, apiSend } from '../../shared/api/client.js';
import { feishuButton, printStyle } from '../../features/reporting/index.js';
import { useCanWrite } from '../../shared/actor.js';
import { PageHeader, WorkbenchPage } from '../../shared/ui/page.js';
import { horizontalFormLayout } from '../../shared/ui/form.js';
import type { UiNotice } from '../../shared/ui/notice.js';
import { SectionGroup, SectionRow } from '../../shared/ui/section.js';
import { space } from '../../theme/tokens.js';
import { ReportSections } from './report-sections.js';

const fileSchema = {
  safeParse(value: unknown) {
    if (typeof value !== 'object' || value === null || !('fileId' in value) || !('fileName' in value)) return { success: false as const };
    if (typeof value.fileId !== 'string' || typeof value.fileName !== 'string') return { success: false as const };
    return { success: true as const, data: { fileId: value.fileId, fileName: value.fileName } };
  },
};
const REPORT_WEEK_INPUT_ID = 'report-week-start';

export function ReportListPage() {
  const [items, setItems] = useState<readonly WeeklyReportListItem[]>([]);
  const [message, setMessage] = useState<UiNotice | null>(null);
  // Render the actionable form in SSR snapshots; the first browser effect
  // switches to loading while the list request is in flight.
  const [isLoaded, setLoaded] = useState(true);
  const [loadError, setLoadError] = useState('');
  const canGenerate = useCanWrite('reports.generate');
  const load = () => {
    setLoaded(false);
    setLoadError('');
    setMessage(null);
    void loadList(setItems, setMessage).then((ok) => {
      setLoaded(true);
      if (!ok) setLoadError('检查登录或网络后重试。');
    }).catch(() => {
      setLoaded(true);
      setLoadError('检查登录或网络后重试。');
    });
  };
  useEffect(() => { load(); }, []);
  if (!isLoaded) return <WorkbenchPage title="周报"><Skeleton active paragraph={{ rows: 8 }} /></WorkbenchPage>;
  if (loadError !== '') return (
    <WorkbenchPage title="周报">
      <Result
        status="error"
        title="周报列表没有读出来"
        subTitle={loadError}
        extra={[
          <Button key="retry" type="primary" onClick={load}>重试</Button>,
          <Button key="dashboard" href="/dashboard">返回管理看板</Button>,
        ]}
      />
    </WorkbenchPage>
  );
  return <ReportListBody items={items} message={message} setItems={setItems} setMessage={setMessage} canGenerate={canGenerate} />;
}

function ReportListBody(props: {
  readonly items: readonly WeeklyReportListItem[];
  readonly message: UiNotice | null;
  readonly setItems: (items: readonly WeeklyReportListItem[]) => void;
  readonly setMessage: (message: UiNotice | null) => void;
  readonly canGenerate: boolean;
}) {
  const { items, message, canGenerate } = props;
  return (
    <WorkbenchPage title="周报">
      {canGenerate ? <ReportForm setItems={props.setItems} setMessage={props.setMessage} /> : null}
      <SectionGroup title="已生成周报" {...(items.length === 0 ? {} : { meta: `${items.length} 份` })}>
        {items.length === 0 ? <Empty description={canGenerate ? '还没有周报。下一步：填写周一后生成。' : '还没有周报。'}>{canGenerate ? <Button onClick={() => document.getElementById(REPORT_WEEK_INPUT_ID)?.focus()}>去填周一</Button> : null}</Empty> : <div>{items.map((item) => <SectionRow key={item.id} action={<Flex gap={space[1]}><Button href={`/reports/${item.id}`}>打开</Button><Button href={`/reports/${item.id}/print`}>打印</Button></Flex>}><Typography.Text>全店 · {item.weekStart} 到 {item.weekEnd}</Typography.Text><br /><Typography.Text type="secondary">{new Date(item.generatedAt).toLocaleString('zh-CN')} · {item.supersededBy === null ? '当前版本' : '历史版本'}</Typography.Text></SectionRow>)}</div>}
      </SectionGroup>
      {message === null ? null : <Alert type={message.kind} showIcon title={message.text} />}
    </WorkbenchPage>
  );
}

function ReportForm({ setItems, setMessage }: {
  readonly setItems: (items: readonly WeeklyReportListItem[]) => void;
  readonly setMessage: (message: UiNotice | null) => void;
}) {
  const [params] = useSearchParams();
  const requestedWeekStart = params.get('weekStart');
  const initialWeekStart = requestedWeekStart !== null && isMondayIso(requestedWeekStart) ? requestedWeekStart : undefined;
  const [isCreating, setCreating] = useState(false);
  function submit({ weekStart }: { readonly weekStart: string }): void {
    if (isCreating) return;
    setCreating(true);
    void createReport({ weekStart, setItems, setMessage }).finally(() => setCreating(false));
  }
  return <SectionGroup title="生成周报">
    <Form<{ readonly weekStart: string }>
      {...horizontalFormLayout}
      key={requestedWeekStart}
      className="settings-form"
      initialValues={{ weekStart: initialWeekStart }}
      scrollToFirstError={{ focus: true }}
      onFinish={submit}
      style={{ maxWidth: 560 }}
    >
      <Form.Item name="weekStart" label="周一" htmlFor={REPORT_WEEK_INPUT_ID} extra="选择报表起始周的周一" validateFirst rules={[
        { required: true, message: '请选择周一日期。' },
        { validator: (_rule, value: unknown) => typeof value === 'string' && isMondayIso(value) ? Promise.resolve() : Promise.reject(new Error('报表起始日必须是周一。')) },
      ]}>
        <Input id={REPORT_WEEK_INPUT_ID} type="date" style={{ width: 160, maxWidth: '100%' }} />
      </Form.Item>
      <Form.Item label=" " colon={false}>
        <Button type="primary" htmlType="submit" loading={isCreating} disabled={isCreating}>生成全店周报</Button>
      </Form.Item>
    </Form>
  </SectionGroup>;
}

export function ReportDetailPage() {
  const params = useParams();
  const [report, setReport] = useState<WeeklyReportDetail | null>(null);
  const [message, setMessage] = useState<UiNotice | null>(null);
  const [isPublishing, setPublishing] = useState(false);
  const [isLoaded, setLoaded] = useState(false);
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const id = params.id ?? '';
  const isConfigured = report === null ? null : report.feishuConfigured;
  const load = () => {
    if (id === '') {
      setLoaded(true);
      setReport(null);
      setMessage({ kind: 'error', text: '缺少周报编号。' });
      return;
    }
    setLoaded(false);
    setMessage(null);
    void loadOne({ id, setReport, setMessage }).finally(() => setLoaded(true));
  };
  useEffect(() => { load(); }, [id]);
  return (
    <WorkbenchPage title="周报详情" browserTitle={report === null ? '周报详情' : `周报 ${report.weekStart}`} maxWidth={1440}>
      <ReportDetailContent report={report} message={message} isLoaded={isLoaded} load={load} id={id} isConfigured={isConfigured} isPublishing={isPublishing} setPublishing={setPublishing} exporting={exporting} setExporting={setExporting} setMessage={setMessage} />
    </WorkbenchPage>
  );
}

function ReportDetailContent(input: {
  readonly report: WeeklyReportDetail | null;
  readonly message: UiNotice | null;
  readonly isLoaded: boolean;
  readonly load: () => void;
  readonly id: string;
  readonly isConfigured: boolean | null;
  readonly isPublishing: boolean;
  readonly setPublishing: (value: boolean) => void;
  readonly exporting: 'xlsx' | 'pdf' | null;
  readonly setExporting: (value: 'xlsx' | 'pdf' | null) => void;
  readonly setMessage: (value: UiNotice | null) => void;
}) {
  const canExport = useCanWrite('reports.export');
  const canPublish = useCanWrite('reports.generate');
  if (!input.isLoaded) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (input.report === null) return <Result status="error" title="周报没有读出来" subTitle={input.message?.text || '检查登录或网络后重试。'} extra={<Button type="primary" onClick={input.load}>重试</Button>} />;
  return (
    <>
      <SectionGroup title={`${input.report.weekStart} 到 ${input.report.weekEnd}`} meta={`全店 · 逾期 ${input.report.data.overview.overdue.value}`}>
        <Flex gap={space[1]} wrap>
          {canExport ? <Button loading={input.exporting === 'xlsx'} disabled={input.exporting !== null} onClick={() => { input.setExporting('xlsx'); void download({ id: input.id, format: 'xlsx', setMessage: input.setMessage }).finally(() => input.setExporting(null)); }}>导出 Excel</Button> : null}
          {canExport ? <Button loading={input.exporting === 'pdf'} disabled={input.exporting !== null} onClick={() => { input.setExporting('pdf'); void download({ id: input.id, format: 'pdf', setMessage: input.setMessage }).finally(() => input.setExporting(null)); }}>导出 PDF</Button> : null}
          {canPublish ? <FeishuPublish configured={input.isConfigured} isPending={input.isPublishing} onPublish={() => { void publish({ id: input.id, configured: input.isConfigured, setMessage: input.setMessage, setPublishing: input.setPublishing }); }} /> : null}
          <Button href={`/reports/${input.id}/print`}>打印页</Button>
        </Flex>
      </SectionGroup>
      <ReportSections data={input.report.data} />
      {input.message === null ? null : <Alert type={input.message.kind} showIcon title={input.message.text} />}
    </>
  );
}

export function FeishuPublish(props: {
  readonly configured: boolean | null;
  readonly isPending: boolean;
  readonly onPublish: () => void;
}) {
  const canPublish = useCanWrite('reports.generate');
  if (!canPublish) return null;
  const button = props.configured === null ? { disabled: true, hint: '' } : feishuButton(props.configured);
  return (
    <>
      <Button disabled={button.disabled} loading={props.isPending} onClick={props.onPublish}>写入飞书文档</Button>
      {button.hint === '' ? null : <p>{button.hint}</p>}
    </>
  );
}

export function ReportPrintPage() {
  const params = useParams();
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [error, setError] = useState('');
  const [isLoaded, setLoaded] = useState(false);
  const id = params.id ?? '';
  const load = () => {
    if (id === '') {
      setError('缺少周报编号。');
      setLoaded(true);
      return;
    }
    setLoaded(false);
    setError('');
    void apiGet(`/api/v1/reports/weekly/${encodeURIComponent(id)}`, WeeklyReportDetailSchema)
      .then((value) => { setReport(value); setLoaded(true); })
      .catch((caught: unknown) => { setReport(null); setError(apiErrorMessage(caught) ?? '周报没有读出来。'); setLoaded(true); });
  };
  useEffect(() => { load(); }, [id]);
  return (
    <main className="report-print">
      <style>{printStyle()}</style>
      <PageHeader title="周报" browserTitle={report === null ? '周报打印' : `周报打印 ${report.weekStart}`} />
      {!isLoaded ? <Skeleton active paragraph={{ rows: 8 }} /> : null}
      {isLoaded && report === null ? <Result status="error" title="周报没有读出来" subTitle={error || '检查登录或网络后重试。'} extra={<Button type="primary" onClick={load}>重试</Button>} /> : null}
      {isLoaded && report !== null ? <><p>全店 · {report.weekStart} 到 {report.weekEnd}</p><ReportSections data={report.data} print /></> : null}
    </main>
  );
}

async function loadList(setItems: (items: readonly WeeklyReportListItem[]) => void, setMessage: (message: UiNotice | null) => void): Promise<boolean> {
  try {
    const listed = await apiGet('/api/v1/reports/weekly', listResponseSchema(WeeklyReportListItemSchema));
    setItems(listed.items);
    return true;
  } catch (error) {
    const message = apiErrorMessage(error);
    if (message === undefined) throw error;
    setMessage({ kind: 'error', text: message });
    return false;
  }
}

async function loadOne({ id, setReport, setMessage }: { readonly id: string; readonly setReport: (report: WeeklyReportDetail | null) => void; readonly setMessage: (message: UiNotice | null) => void }): Promise<boolean> {
  try {
    setReport(await apiGet(`/api/v1/reports/weekly/${encodeURIComponent(id)}`, WeeklyReportDetailSchema));
    setMessage(null);
    return true;
  } catch (error) {
    const message = apiErrorMessage(error);
    if (message === undefined) throw error;
    setReport(null);
    setMessage({ kind: 'error', text: message });
    return false;
  }
}

export async function publishWeekly(input: { readonly id: string; readonly configured: boolean }): Promise<string | null> {
  if (!input.configured) return null;
  const published = await apiSend({
    path: `/api/v1/reports/weekly/${encodeURIComponent(input.id)}/feishu`,
    method: 'POST',
    schema: FeishuPublishResultSchema,
  });
  return published.docUrl;
}

async function publish(input: {
  readonly id: string;
  readonly configured: boolean | null;
  readonly setMessage: (message: UiNotice | null) => void;
  readonly setPublishing: (isPending: boolean) => void;
}) {
  if (input.configured !== true) return;
  input.setPublishing(true);
  try {
    const docUrl = await publishWeekly({ id: input.id, configured: true });
    if (docUrl !== null) input.setMessage({ kind: 'info', text: docUrl });
  } catch (error) {
    const message = apiErrorMessage(error);
    if (message === undefined) throw error;
    input.setMessage({ kind: 'error', text: message });
  } finally {
    input.setPublishing(false);
  }
}

async function createReport({ weekStart, setItems, setMessage }: { readonly weekStart: string; readonly setItems: (items: readonly WeeklyReportListItem[]) => void; readonly setMessage: (message: UiNotice | null) => void }) {
  try {
    await apiSend({ path: '/api/v1/reports/weekly', method: 'POST', body: { weekStart }, schema: WeeklyReportSchema });
    setMessage({ kind: 'info', text: '已生成' });
    await loadList(setItems, setMessage);
  } catch (error) {
    const message = apiErrorMessage(error);
    if (message === undefined) throw error;
    setMessage({ kind: 'error', text: message });
  }
}

export function isMondayIso(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && date.getUTCDay() === 1;
}

async function download({ id, format, setMessage }: { readonly id: string; readonly format: 'xlsx' | 'pdf'; readonly setMessage: (message: UiNotice | null) => void }) {
  try {
    const file = await apiSend({ path: `/api/v1/reports/weekly/${encodeURIComponent(id)}/exports`, method: 'POST', body: { format }, schema: fileSchema });
    await apiDownload({ path: `/files/${encodeURIComponent(file.fileId)}`, fileName: file.fileName });
    setMessage({ kind: 'info', text: `已下载 ${file.fileName}` });
  } catch (error) {
    const message = apiErrorMessage(error);
    if (message === undefined) throw error;
    setMessage({ kind: 'error', text: message });
  }
}
