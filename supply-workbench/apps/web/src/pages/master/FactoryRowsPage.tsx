import { ProcurementCutoff } from '../../shared/ui/procurement-cutoff.js';
import { Alert, Button, Pagination, Skeleton, Space } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { listResponseSchema, type ListResponse } from '@sw/contracts';
import { apiGetWithSignal } from '../../shared/api/client.js';
import { SectionGroup } from '../../shared/ui/section.js';
import { space } from '../../theme/tokens.js';

const PAGE_SIZE = 20;

export type ReadFactoryRows<T> = (page: number, signal: AbortSignal) => Promise<ListResponse<T>>;

export function factoryRowsReader<T>(path: string, schema: Parameters<typeof listResponseSchema<T>>[0]): ReadFactoryRows<T> {
  const response = listResponseSchema(schema);
  const prefix = path.includes('?') ? `${path}&` : `${path}?`;
  return (page, signal) => apiGetWithSignal({ path: `${prefix}page=${page}&pageSize=${PAGE_SIZE}`, schema: response, signal });
}

type PageRequest = { readonly page: number };
type PageValue<T> = { readonly kind: 'ready'; readonly data: ListResponse<T> } | { readonly kind: 'error' };
type PageResponse<T> = {
  readonly request: PageRequest;
  readonly value: PageValue<T>;
};

export function FactoryRowsPage<T>({ title, read, disabled = false, controls, children }: {
  readonly title: string;
  readonly read: ReadFactoryRows<T>;
  readonly disabled?: boolean;
  readonly controls?: ReactNode;
  readonly children: (rows: readonly T[]) => ReactNode;
}) {
  const { current, paging, page, changePage } = useFactoryRows(read);
  const meta = current?.kind === 'ready' ? { meta: `共 ${current.data.page.total} 条` } : {};
  return (
    <SectionGroup title={title} {...meta} action={<ProcurementCutoff />}>
      {controls}
      <div aria-busy={current === null}>
        {renderRows({ current, title, children, retry: () => changePage(page) })}
      </div>
      {paging === null || paging.total <= paging.pageSize ? null : (
        <nav aria-label={`${title}分页`} style={{ marginTop: space[2] }}>
          <Pagination current={page} pageSize={paging.pageSize} total={paging.total} showSizeChanger={false}
            size="small" disabled={disabled || current === null} onChange={changePage} />
        </nav>
      )}
    </SectionGroup>
  );
}

function renderRows<T>({ current, title, children, retry }: {
  readonly current: PageValue<T> | null;
  readonly title: string;
  readonly children: (rows: readonly T[]) => ReactNode;
  readonly retry: () => void;
}): ReactNode {
  if (current === null) return <Skeleton active paragraph={{ rows: 3 }} />;
  if (current.kind === 'error') return <FactoryReadError message={`${title}没有读出来。`} onRetry={retry} />;
  return children(current.data.items);
}

function useFactoryRows<T>(read: ReadFactoryRows<T>) {
  const [request, setRequest] = useState<PageRequest>({ page: 1 });
  const [response, setResponse] = useState<PageResponse<T> | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void read(request.page, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      const last = Math.max(1, Math.ceil(data.page.total / data.page.pageSize));
      if (request.page > last) {
        setRequest({ page: last });
        return;
      }
      setResponse({ request, value: { kind: 'ready', data } });
    }).catch(() => {
      if (!controller.signal.aborted) setResponse({ request, value: { kind: 'error' } });
    });
    return () => controller.abort();
  }, [read, request]);

  const current = response?.request === request ? response.value : null;
  const paging = response?.value.kind === 'ready' ? response.value.data.page : null;
  return { current, paging, page: request.page, changePage: (page: number) => setRequest({ page }) };
}

export function FactoryReadError({ message, onRetry }: { readonly message: string; readonly onRetry: () => void }) {
  return (
    <Space orientation="vertical" size={space[2]} style={{ width: '100%' }}>
      <Alert type="error" showIcon title={message} />
      <Button onClick={onRetry}>重试</Button>
    </Space>
  );
}
