import { Alert, Button, Card, Col, Flex, Row, Skeleton, Table, Typography, type TableColumnsType } from 'antd';
import type { ProcurementStore } from '@sw/contracts';
import type { LocalDate } from '@sw/domain';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useOutletContext } from 'react-router';
import type { NavRow } from '../../features/shell/index.js';
import { failureText, readFailureOf } from '../../shared/api/reads.js';
import { MetricStrip } from '../../shared/ui/analytics.js';
import { navGlyph } from '../../shared/ui/nav-glyph.js';
import { bg, border, brand, radiusCard, space } from '../../theme/tokens.js';
import { initialFilter, WorkDetails, type WorkFilter } from './WorkDetails.js';
import { inView, loadWorkLines, ownerLoads, VIEWS, workRows, type OwnerLoad, type View, type WorkRow } from './work-register.js';

type Load = { kind: 'ready'; rows: WorkRow[] } | { kind: 'error'; message: string };
function useWorkRegister(scope: ProcurementStore, today: LocalDate) {
  const [load, setLoad] = useState<Load>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    loadWorkLines(scope, controller.signal).then((lines) => {
      if (!controller.signal.aborted) setLoad({ kind: 'ready', rows: workRows(lines, today) });
    }).catch((error: unknown) => {
      const failure = readFailureOf(error);
      if (!controller.signal.aborted && failure !== null) setLoad({ kind: 'error', message: failureText(failure) });
    });
    return () => controller.abort();
  }, [scope, today, revision]);
  return { load, retry: () => { setLoad(undefined); setRevision((value) => value + 1); } };
}

function Shortcuts() {
  const nav = useOutletContext<readonly NavRow[]>();
  const routes = nav.filter((row) => row.to !== '/home');
  return <nav aria-label="可用功能" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 102px), 1fr))', gap: space[1] }}>
    {routes.map((row) => <Link key={row.to} to={row.destinations?.[0]?.to ?? row.to}
      style={{ background: bg.surface, border: `1px solid ${border}`, borderRadius: radiusCard, color: brand[800], paddingBlock: space[2] }}>
      <Flex vertical align="center" justify="center" gap={space[1]}>
        <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>{navGlyph(row.to)}</span>
        <span>{row.label}</span>
      </Flex>
    </Link>)}
  </nav>;
}

export function DirectorWorkBoard({ scope, today, children }: {
  readonly scope: ProcurementStore; readonly today: LocalDate; readonly children: ReactNode;
}) {
  const { load, retry } = useWorkRegister(scope, today);
  const [filter, setFilter] = useState<WorkFilter>(initialFilter);
  const detailRegion = useRef<HTMLDivElement>(null);
  const select = (view: View, owner?: string) => {
    setFilter({ ...initialFilter, view, owner });
    if (owner !== undefined) detailRegion.current?.focus();
  };
  const owners = load?.kind === 'ready' ? ownerLoads(load.rows) : [];
  return <Row gutter={[space[3], space[3]]}>
    <Col xs={24} lg={16} style={{ minWidth: 0 }}><Flex vertical gap={space[3]}>
      <Shortcuts />
      {load === undefined ? <Skeleton active /> : load.kind === 'error'
        ? <Alert type="error" showIcon title="事项清单暂未读出" description={load.message} action={<Button onClick={retry}>重试</Button>} />
        : <>
          <WorkMetrics rows={load.rows} view={filter.view} onSelect={select} />
          <div tabIndex={-1} ref={detailRegion} aria-label="已筛选的事项" style={{ minWidth: 0 }}>
            <WorkDetails rows={load.rows} owners={owners} filter={filter} onFilter={setFilter} />
          </div>
        </>}
    </Flex></Col>
    <Col xs={24} lg={8} style={{ minWidth: 0 }}><Flex vertical gap={space[3]}>
      {load?.kind === 'ready' ? <OwnerBoard owners={owners} select={select} /> : null}
      {children}
    </Flex></Col>
  </Row>;
}

function WorkMetrics({ rows, view, onSelect }: { readonly rows: readonly WorkRow[]; readonly view: View; readonly onSelect: (view: View) => void }) {
  const keys: readonly View[] = ['all', 'risk', 'watch'];
  const hints = { all: '每条成品或物料订单行算一件', risk: '已逾期或确认到货晚于需求', watch: '交期、异常或负责人需要跟踪' };
  const tones = { all: 'neutral', risk: 'danger', watch: 'warning' } as const;
  return <MetricStrip ariaLabel="事项概览" items={keys.map((key) => ({
    key, label: VIEWS[key], value: rows.filter((row) => inView(row, key)).length, unit: '件', hint: hints[key], tone: tones[key],
    action: { isActive: key === view, select: () => onSelect(key) },
  }))} />;
}

function OwnerBoard({ owners, select }: { readonly owners: readonly OwnerLoad[]; readonly select: (view: View, owner: string) => void }) {
  const count = (owner: OwnerLoad, view: View) => {
    const value = view === 'all' ? owner.total : owner[view];
    return value === 0 ? <Typography.Text type="secondary">0</Typography.Text>
    : <Button size="small" type="link" aria-label={`${owner.name} · ${VIEWS[view]} ${value} 件`}
      onClick={() => select(view, owner.id)}>{value}</Button>;
  };
  const columns: TableColumnsType<OwnerLoad> = [
    { title: '采购负责人', dataIndex: 'name', rowScope: 'row' },
    { title: '在做', align: 'right', render: (_, owner) => count(owner, 'all') },
    { title: '交期风险', align: 'right', render: (_, owner) => count(owner, 'risk') },
    { title: '需关注', align: 'right', render: (_, owner) => count(owner, 'watch') },
  ];
  return <section aria-label="员工负责事项"><Card title="员工负责事项" size="small">
    <Table size="small" rowKey="id" dataSource={owners} columns={columns} tableLayout="fixed"
      pagination={{ pageSize: 8, hideOnSinglePage: true, showSizeChanger: false }}
      locale={{ emptyText: '当前范围没有进行中的订单' }} />
  </Card></section>;
}
