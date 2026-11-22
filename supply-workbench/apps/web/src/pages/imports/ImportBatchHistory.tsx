import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Alert, Button, Flex, Select, Skeleton, Typography } from 'antd';
import { ImportBatchListItemSchema, listResponseSchema, type ImportBatchListItem } from '@sw/contracts';
import { IMPORT_STATUSES, TEMPLATE_IDS, importStatusLabel, templateIdLabel } from '@sw/domain';
import { apiGetWithSignal } from '../../shared/api/client.js';
import { writeUrlState } from '../../shared/hooks/url-state.js';
import { formatDateTime } from '../../shared/ui/format.js';
import { SectionGroup, SectionRow } from '../../shared/ui/section.js';
import { space } from '../../theme/tokens.js';
import { ImportPagination } from './ImportPagination.js';

const PAGE_SIZE = 10;
const schema = listResponseSchema(ImportBatchListItemSchema);
const templateOptions = [{ value: '', label: '全部模板' }, ...TEMPLATE_IDS.map((id) => ({ value: id, label: templateIdLabel(id) }))];
const statusOptions = [{ value: '', label: '全部状态' }, ...IMPORT_STATUSES.map((id) => ({ value: id, label: importStatusLabel(id) }))];
type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly query: string }
  | { readonly kind: 'ready'; readonly query: string; readonly items: readonly ImportBatchListItem[]; readonly total: number };

export function ImportBatchHistory() {
  const [search, setSearch] = useSearchParams();
  const template = TEMPLATE_IDS.find((id) => id === search.get('template')) ?? '';
  const status = IMPORT_STATUSES.find((id) => id === search.get('status')) ?? '';
  const page = pageNumber(search.get('page'));
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (template !== '') query.set('template', template);
  if (status !== '') query.set('status', status);
  const update = (patch: Record<string, string | null>) => setSearch(writeUrlState(search.toString(), patch));
  const historySearch = search.toString();
  return (
    <SectionGroup title="导入批次历史" meta="按导入时间从新到旧">
      <search aria-label="导入批次历史筛选">
        <Flex wrap gap={space[2]} style={{ marginBottom: space[2] }}>
          <Flex align="center" gap={space[1]}>
            <label htmlFor="history-template">筛选导入模板</label>
            <Select id="history-template" virtual={false} value={template} options={templateOptions} style={{ minWidth: 144 }}
              onChange={(value) => update({ template: value, page: null })}
            />
          </Flex>
          <Flex align="center" gap={space[1]}>
            <label htmlFor="history-status">筛选批次状态</label>
            <Select id="history-status" virtual={false} value={status} options={statusOptions} style={{ minWidth: 112 }}
              onChange={(value) => update({ status: value, page: null })}
            />
          </Flex>
        </Flex>
      </search>
      <HistoryResults key={`${template}/${status}`} query={query.toString()} historySearch={historySearch}
        page={page} onPage={(next) => update({ page: next === 1 ? null : String(next) })}
      />
    </SectionGroup>
  );
}

function HistoryResults(props: {
  readonly query: string;
  readonly historySearch: string;
  readonly page: number;
  readonly onPage: (value: number) => void;
}) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void apiGetWithSignal({ path: `/api/v1/imports?${props.query}`, schema, signal: controller.signal })
      .then(({ items, page }) => {
        if (!controller.signal.aborted) setLoad({ kind: 'ready', query: props.query, items, total: page.total });
      })
      .catch(() => { if (!controller.signal.aborted) setLoad({ kind: 'failed', query: props.query }); });
    return () => controller.abort();
  }, [props.query, attempt]);
  const isLoading = load.kind === 'loading' || load.query !== props.query;
  return (
    <>
      <div aria-busy={isLoading}>
        {isLoading ? <Skeleton active paragraph={{ rows: 2 }} /> : <HistoryRows load={load} historySearch={props.historySearch} onRetry={() => {
          setLoad({ kind: 'loading' });
          setAttempt((current) => current + 1);
        }} />}
      </div>
      <ImportPagination label="导入批次历史分页" page={props.page} pageSize={PAGE_SIZE} total={load.kind === 'ready' ? load.total : 0} onChange={props.onPage} />
    </>
  );
}

function HistoryRows({ load, historySearch, onRetry }: {
  readonly load: Exclude<Load, { readonly kind: 'loading' }>;
  readonly historySearch: string;
  readonly onRetry: () => void;
}) {
  if (load.kind === 'failed') return (
    <Alert type="error" title="导入批次历史没有读出来。" action={<Button onClick={onRetry}>重试</Button>} />
  );
  if (load.items.length === 0) return <Typography.Text type="secondary">没有符合条件的导入批次。</Typography.Text>;
  return load.items.map((item) => <HistoryRow key={item.id} item={item} historySearch={historySearch} />);
}

function HistoryRow({ item, historySearch }: { readonly item: ImportBatchListItem; readonly historySearch: string }) {
  const created = formatDateTime(item.createdAt) ?? '—';
  const committed = formatDateTime(item.committedAt);
  return (
    <SectionRow>
      <Flex vertical gap={space[1]}>
        <Link style={{ overflowWrap: 'anywhere' }} to={{ pathname: `/imports/${encodeURIComponent(item.id)}`, search: historySearch }}>{item.originalName}</Link>
        <Typography.Text type="secondary">
          {templateIdLabel(item.template)} · {importStatusLabel(item.status)}
          {item.factoryParty === null ? '' : ` · ${item.factoryParty.displayName}`}
        </Typography.Text>
        <Typography.Text type="secondary">
          导入于 {created}{committed === null ? '' : ` · 提交于 ${committed}`}
        </Typography.Text>
      </Flex>
    </SectionRow>
  );
}

function pageNumber(raw: string | null): number {
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}
