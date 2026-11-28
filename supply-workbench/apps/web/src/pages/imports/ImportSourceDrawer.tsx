import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Alert, Button, Descriptions, Drawer, Flex, Skeleton, Typography, type DescriptionsProps } from 'antd';
import { IMPORT_RETURN_PARAM } from '../../features/imports/index.js';
import { useCan } from '../../shared/actor.js';
import { failureText, read, readFailureOf } from '../../shared/api/reads.js';
import { useDetailFocusLink, useDetailReturnFocus } from '../../shared/hooks/detail-return-focus.js';
import { drawerWidth, space } from '../../theme/tokens.js';
import { importBatchOrigin, importSourceTriggerId, type ImportSourceState, type SourceLocation } from './import-source.js';

type Target =
  | { readonly kind: 'scope'; readonly importId: string }
  | { readonly kind: 'order'; readonly importId: string; readonly lineId: string }
  | { readonly kind: 'batch'; readonly lineId: string; readonly batchId: string };

export type ImportSourceRecord = {
  readonly key: string;
  readonly location?: SourceLocation;
  readonly items: NonNullable<DescriptionsProps['items']>;
  readonly result: { readonly kind: 'local'; readonly text: string } | Target;
};

export function ImportSourceButton({ source, recordKey, label }: {
  readonly source: ImportSourceState;
  readonly recordKey: string;
  readonly label?: string;
}) {
  return <Button id={importSourceTriggerId(recordKey)} aria-label={label} aria-haspopup="dialog" onClick={() => source.open(recordKey)}>
    {recordKey === 'batch' ? '核对本次导入来源' : '查看来源'}
  </Button>;
}

export function UnavailableImportSource({ onClear }: { readonly onClear: () => void }) {
  return <Alert type="info" title="找不到链接中的来源记录。"
    action={<Button onClick={onClear}>清除来源定位</Button>} />;
}

export function ImportSourceDrawer({ source, record, fileName }: {
  readonly source: ImportSourceState;
  readonly record: ImportSourceRecord | null;
  readonly fileName: string;
}) {
  const [isShown, setShown] = useState(false);
  const trigger = useRef<string | null>(null);
  const key = record?.key ?? null;
  const canRead = useCan('data.read');
  useEffect(() => {
    if (key !== null) trigger.current = importSourceTriggerId(key);
  }, [key]);
  return <Drawer title={key === 'batch' ? '核对本次导入来源' : '核对导入记录来源'} open={key !== null}
    size={`min(${drawerWidth}px, 100vw)`} destroyOnHidden
    closable={{ 'aria-label': '关闭导入来源' }}
    focusable={{ trap: true, focusTriggerAfterClose: false }}
    onClose={source.close} afterOpenChange={(shown) => {
      setShown(shown);
      if (!shown && trigger.current !== null) {
        const triggerId = trigger.current;
        trigger.current = null;
        window.requestAnimationFrame(() => {
          if (trigger.current === null) document.getElementById(triggerId)?.focus();
        });
      }
    }}>
    {record === null ? null : <Flex vertical gap={space[3]}>
      <Descriptions size="small" column={1} styles={{ content: { overflowWrap: 'anywhere' } }} items={[
        { key: 'file', label: '文件', children: fileName },
        ...(record.location === undefined ? [] : [{ key: 'location', label: '原表位置', children: sourceText(record.location) }]),
        ...record.items,
      ]} />
      <ImportSourceResult record={record} canRead={canRead} source={source} isShown={isShown} />
    </Flex>}
  </Drawer>;
}

function ImportSourceResult({ record, canRead, source, isShown }: {
  readonly record: ImportSourceRecord; readonly canRead: boolean; readonly source: ImportSourceState; readonly isShown: boolean;
}) {
  if (record.result.kind === 'local') return <Typography.Text>{record.result.text}</Typography.Text>;
  if (!canRead) return <Alert type="info" title="当前账号无法查看关联订单。" />;
  return <ImportTarget key={JSON.stringify(record.result)} target={record.result} source={source} sourceKey={record.key} isShown={isShown} />;
}

export function sourceText(location: SourceLocation) {
  return `${location.sheetName} 第 ${location.rowNo} 行`;
}

type Destination = { readonly href: string; readonly label: string; readonly text: string };
type TargetLoad =
  | { readonly kind: 'loading' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly destination: Destination };

function ImportTarget({ target, source, sourceKey, isShown }: {
  readonly target: Target;
  readonly source: ImportSourceState;
  readonly sourceKey: string;
  readonly isShown: boolean;
}) {
  const [load, setLoad] = useState<TargetLoad>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [request] = useState(target);
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    const result = request.kind === 'batch'
      ? readBatchDestination({ ...request, signal })
      : readImportDestination({ importId: request.importId, lineId: request.kind === 'order' ? request.lineId : undefined, signal });
    void result.then((destination) => {
      if (!signal.aborted) setLoad(destination === null ? { kind: 'missing' } : { kind: 'ready', destination });
    }).catch((error: unknown) => {
      if (signal.aborted) return;
      const failure = readFailureOf(error);
      if (failure === null) return;
      if (failure.kind === 'api' && (failure.code === 'NOT_FOUND' || failure.code === 'FORBIDDEN')) {
        setLoad({ kind: 'missing' });
        return;
      }
      setLoad({ kind: 'failed', message: failureText(failure) });
    });
    return () => controller.abort();
  }, [attempt, request]);
  switch (load.kind) {
    case 'loading': return <div role="status" aria-label="正在核对关联记录"><Skeleton active paragraph={false} /></div>;
    case 'missing': return <Alert type="info" title="当前范围没有可查看的关联记录。" />;
    case 'failed': return <Alert type="error" title="关联记录没有读出来。" description={load.message} action={<Button onClick={() => {
      setLoad({ kind: 'loading' });
      setAttempt((value) => value + 1);
    }}>重试</Button>} />;
    case 'ready': return <ImportTargetLink destination={load.destination} source={source} sourceKey={sourceKey} isShown={isShown} />;
  }
}

async function readImportDestination({ importId, lineId, signal }: {
  readonly importId: string;
  readonly lineId: string | undefined;
  readonly signal: AbortSignal;
}): Promise<Destination | null> {
  const scope = new URLSearchParams({ lane: 'all', importBatchId: importId });
  const query = new URLSearchParams({ importBatchId: importId, pageSize: '1' });
  if (lineId !== undefined) query.set('lineIds', lineId);
  const { items, page } = await read({ name: 'lines', query: query.toString(), signal });
  if (lineId === undefined) {
    return page.total === 0 ? null : {
      href: `/lines?${scope}`, label: '查看本次实际关联的订单', text: `本次导入关联 ${page.total} 条可查看的订单行。`,
    };
  }
  const line = items.find((item) => item.id === lineId);
  if (line === undefined) return null;
  const address = `/lines/${encodeURIComponent(line.id)}?${new URLSearchParams({ importBatchId: importId })}`;
  return { href: address, label: '查看关联订单', text: [line.po.poRaw, line.nameRaw].filter(Boolean).join(' · ') };
}

async function readBatchDestination({ lineId, batchId, signal }: {
  readonly lineId: string;
  readonly batchId: string;
  readonly signal: AbortSignal;
}): Promise<Destination | null> {
  const href = `/lines/${encodeURIComponent(lineId)}`;
  const detail = await read({ name: 'line', id: lineId, signal });
  const batch = detail.batches.find((item) => item.id === batchId);
  if (batch === undefined) return null;
  return {
    href: `${href}?${new URLSearchParams({ focusBatch: batch.id })}`,
    label: '查看关联要货批次',
    text: [detail.po.poRaw, detail.line.nameRaw, `第 ${batch.seq} 批`].filter(Boolean).join(' · '),
  };
}

function ImportTargetLink({ destination, source, sourceKey, isShown }: {
  readonly destination: Destination;
  readonly source: ImportSourceState;
  readonly sourceKey: string;
  readonly isShown: boolean;
}) {
  const { state } = useLocation();
  const { state: origin, ...link } = useDetailFocusLink(source.to, importSourceTriggerId(sourceKey));
  useDetailReturnFocus(isShown, { allowContainerFocus: true });
  const query = new URLSearchParams({ [IMPORT_RETURN_PARAM]: source.to });
  const to = `${destination.href}${destination.href.includes('?') ? '&' : '?'}${query}`;
  return <Flex vertical align="start" gap={space[2]}>
    <Typography.Text strong style={{ overflowWrap: 'anywhere' }}>{destination.text}</Typography.Text>
    <Link to={to} {...link} state={{ ...origin, importBatchOrigin: importBatchOrigin(state) }} style={{ paddingBlock: space[1] }}>{destination.label}</Link>
  </Flex>;
}
