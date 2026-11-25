import { Alert, Button, Col, Flex, Row, Skeleton } from 'antd';
import { lineInScope, type BrandScope } from './project-register.js';
import type { LocalDate } from '@sw/domain';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useOutletContext } from 'react-router';
import type { ShellView } from '../../features/shell/index.js';
import { failureText, readFailureOf } from '../../shared/api/reads.js';
import { MetricStrip } from '../../shared/ui/analytics.js';
import { navGlyph } from '../../shared/ui/nav-glyph.js';
import { bg, border, brand, radiusCard, space } from '../../theme/tokens.js';
import { WorkDetails } from './WorkDetails.js';
import { initialFilter, inView, loadWorkLines, ownerLoads, VIEWS, workRows, type View, type WorkFilter, type WorkRow } from './work-register.js';

type Load = { kind: 'ready'; rows: WorkRow[] } | { kind: 'error'; message: string };
function useWorkRegister(today: LocalDate) {
  const [load, setLoad] = useState<Load>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    loadWorkLines('all', controller.signal).then((lines) => {
      if (!controller.signal.aborted) setLoad({ kind: 'ready', rows: workRows(lines, today) });
    }).catch((error: unknown) => {
      const failure = readFailureOf(error);
      if (!controller.signal.aborted && failure !== null) setLoad({ kind: 'error', message: failureText(failure) });
    });
    return () => controller.abort();
  }, [today, revision]);
  return { load, retry: () => { setLoad(undefined); setRevision((value) => value + 1); } };
}

function Shortcuts() {
  const { nav } = useOutletContext<ShellView>();
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

export function DirectorWorkBoard({ scope, today, children, memberships, brandsReady }: {
  readonly memberships: Map<string, Set<string | null>>; readonly brandsReady: boolean;
  readonly scope: BrandScope; readonly today: LocalDate; readonly children: ReactNode;
}) {
  const { load, retry } = useWorkRegister(today);
  const rows = useMemo(() => {
    if (load?.kind !== 'ready') return [];
    if (scope === 'all') return load.rows;
    const includes = (id: string) => lineInScope(scope, memberships.get(id));
    return load.rows.filter((row) => includes(row.line.id)).map((row) => ({ ...row, related: row.related.filter((p) => includes(p.id)) }));
  }, [load, memberships, scope]);
  return <Row className="director-board" gutter={[space[3], space[3]]}>
    <Col xs={24} lg={16} style={{ minWidth: 0 }}><Flex vertical gap={space[3]}>
      <Shortcuts />
      {load === undefined || (scope !== 'all' && !brandsReady) ? <Skeleton active /> : load.kind === 'error'
        ? <Alert type="error" showIcon title="事项清单暂未读出" description={load.message} action={<Button onClick={retry}>重试</Button>} />
        : <FilteredWork key={scope} rows={rows} />}
    </Flex></Col>
    <Col xs={24} lg={8} style={{ minWidth: 0 }}><Flex vertical gap={space[3]}>
      {children}
    </Flex></Col>
  </Row>;
}

function FilteredWork({ rows }: { readonly rows: WorkRow[] }) {
  const [filter, setFilter] = useState<WorkFilter>(initialFilter);
  return <>
    <WorkMetrics rows={rows} view={filter.view} onSelect={(view) => setFilter({ ...initialFilter, view })} />
    <WorkDetails rows={rows} owners={ownerLoads(rows)} filter={filter} onFilter={setFilter} />
  </>;
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
