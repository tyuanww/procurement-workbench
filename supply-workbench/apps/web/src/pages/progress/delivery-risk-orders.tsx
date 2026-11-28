import { Button, Card, Empty, Flex, Result, Skeleton, Table, Tag, Typography, type TableColumnsType } from 'antd';
import type { OrderLineRow } from '@sw/contracts';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { dailyDeliveryParams, DELIVERY_RISK_REASONS, deliveryRiskReasons, useFollowUpSearch, type homeDeliveryRiskOf } from '../../features/follow-up/index.js';
import { useShellViewport } from '../../features/shell/index.js';
import { failureText, read, readFailureOf } from '../../shared/api/reads.js';
import { detailReturnState } from '../../shared/hooks/detail-return-focus.js';
import { space, topBar } from '../../theme/tokens.js';
import { HOME_RISK_GROUP_FOCUS, HOME_RISK_RETURN_PARAM, homeRiskBackAddress } from '../director-home/home-location.js';
import { DeliveryDetailLink, useDeliveryReturnFocus } from './delivery-detail-link.js';
import { progressPagination, resetProgressPagination, storeLabels, withProgressPagination } from './store-query.js';

type Risk = Extract<ReturnType<typeof homeDeliveryRiskOf>, { kind: 'home-risk' }>;
type Load = { kind: 'pending' } | { kind: 'failed'; message: string } | { kind: 'ready'; lines: OrderLineRow[] };
const READ_LIMIT = 100;

export function DeliveryRiskOrders({ risk }: { readonly risk: Risk | { kind: 'invalid' } }) {
  const [params, setParams] = useFollowUpSearch();
  const { state } = useLocation();
  const home = homeRiskBackAddress(params.get(HOME_RISK_RETURN_PARAM));
  const close = <Button onClick={() => {
    const daily = resetProgressPagination(dailyDeliveryParams(params));
    daily.delete(HOME_RISK_RETURN_PARAM);
    setParams(daily);
  }}>查看日常店铺交付</Button>;
  if (risk.kind === 'invalid') return <Empty description="这组订单的店铺、日期或范围不完整。">{close}</Empty>;
  return <>
    {home === null ? null : <Link to={home} state={detailReturnState(state, { detailPath: home, sourceLink: HOME_RISK_GROUP_FOCUS })}>返回首页</Link>}
    <Card size="small" style={{ marginBottom: space[3] }}>
      <Flex align="center" justify="space-between" wrap gap={space[2]}>
        <Typography.Text strong>{storeLabels[risk.store]} · 首页交期风险 · {risk.date}</Typography.Text>
        {close}
      </Flex>
    </Card>
    <RiskResults key={JSON.stringify(risk)} risk={risk} />
  </>;
}

function RiskResults({ risk }: { readonly risk: Risk }) {
  const [params, setParams] = useFollowUpSearch();
  const { page, pageSize } = progressPagination(params);
  const search = params.toString();
  const { load, retry } = useRiskRows(risk);
  const isPhone = useShellViewport().band === 'phone';
  const results = useRef<HTMLElement>(null);
  const isSourceMissing = useDeliveryReturnFocus({ search, isReady: load.kind === 'ready', region: results });
  return <section ref={results} tabIndex={-1} aria-label="首页交期风险结果">
    {load.kind === 'pending' ? <Skeleton active /> : null}
    {load.kind === 'failed' ? <Result status="error" title="这组订单没有读出来" subTitle={load.message}
      extra={<Button onClick={retry}>重试</Button>} /> : null}
    {load.kind === 'ready' ? <>
      {isSourceMissing ? <Typography.Paragraph role="status">当前页找不到原记录入口，已保留查询。</Typography.Paragraph> : null}
      <Typography.Paragraph role="status">
        {load.lines.length} 条订单行
        {load.lines.length === risk.ids.length ? null : ` · ${risk.ids.length - load.lines.length} 条在原店铺范围内不可查`}
      </Typography.Paragraph>
      <Table size="small" rowKey="id" dataSource={load.lines} columns={riskColumns({ risk, search, isPhone })}
        {...(isPhone ? {} : { sticky: { offsetHeader: topBar } })} tableLayout="fixed"
        pagination={{ hideOnSinglePage: true, current: page, pageSize, showSizeChanger: false,
          onChange: (nextPage) => setParams(withProgressPagination(params, { page: nextPage, pageSize }), { preventScrollReset: true }),
        }}
        locale={{ emptyText: '在原店铺范围内未查到这组订单。' }} />
    </> : null}
  </section>;
}

function riskColumns({ risk, search, isPhone }: { readonly risk: Risk; readonly search: string; readonly isPhone: boolean }): TableColumnsType<OrderLineRow> {
  return [
    { title: '采购单 / 品名', key: 'line', rowScope: 'row', render: (_, line) => (
      <Flex vertical align="start" style={{ overflowWrap: 'anywhere' }}>
        <DeliveryDetailLink id={line.id} search={search} store={risk.store} focusKey={`risk:${line.id}`}
          focusBatch={line.nextDue?.batchId}>{line.po.poRaw ?? '打开订单行'}</DeliveryDetailLink>
        <Typography.Text>{line.nameRaw ?? line.itemCodeRaw ?? '品名待补'}</Typography.Text>
        <Typography.Text type="secondary">{line.lane === 'finished' ? '成品' : '物料'}</Typography.Text>
      </Flex>
    ) },
    { title: '风险原因', key: 'risk', render: (_, line) => {
      const reasons = deliveryRiskReasons(line, risk.date);
      return reasons.length === 0 ? '当前记录已无该日交期风险' : <Flex vertical={isPhone} wrap={isPhone ? false : 'wrap'} gap={space[1]} align="start">
        {reasons.map((reason) => <Tag key={reason} color={reason === 'overdue' ? 'error' : 'warning'}
          style={{ whiteSpace: 'normal', marginInlineEnd: 0 }}>{DELIVERY_RISK_REASONS[reason]}</Tag>)}
      </Flex>;
    } },
    ...(isPhone ? [] : [
      { title: '采购确认到货日', key: 'confirmed', render: (_value: unknown, line: OrderLineRow) => line.nextDue?.dateBuyerConfirmed ?? '—' },
      { title: '对应需求日', key: 'required', render: (_value: unknown, line: OrderLineRow) => line.nextDue?.dateFactoryRequired ?? '—' },
    ]),
  ];
}

function useRiskRows(risk: Risk) {
  const [load, setLoad] = useState<Load>({ kind: 'pending' });
  const [revision, setRevision] = useState(0);
  const { ids, store } = risk;
  const request = new URLSearchParams();
  for (const id of ids) request.append('lineIds', id);
  const requested = request.toString();
  useEffect(() => {
    const controller = new AbortController();
    setLoad({ kind: 'pending' });
    void readRiskRows({ requested, store, signal: controller.signal }).then((lines) => {
      if (!controller.signal.aborted) setLoad({ kind: 'ready', lines });
    }, (error: unknown) => {
      if (controller.signal.aborted) return;
      const failure = readFailureOf(error);
      setLoad({ kind: 'failed', message: failure === null ? '' : failureText(failure) });
    });
    return () => controller.abort();
  }, [requested, revision, store]);
  return { load, retry: () => setRevision((value) => value + 1) };
}

async function readRiskRows({ requested, store, signal }: {
  readonly requested: string;
  readonly store: Risk['store'];
  readonly signal: AbortSignal;
}) {
  const ids = new URLSearchParams(requested).getAll('lineIds');
  const pages = [];
  for (let index = 0; index < ids.length; index += READ_LIMIT) {
    const query = new URLSearchParams({ store, pageSize: String(READ_LIMIT) });
    for (const id of ids.slice(index, index + READ_LIMIT)) query.append('lineIds', id);
    pages.push(read({ name: 'lines', query: query.toString(), signal }));
  }
  const results = await Promise.all(pages);
  const byId = new Map(results.flatMap(({ items }) => items.map((line) => [line.id, line] as const)));
  return ids.flatMap((id) => {
    const line = byId.get(id);
    return line === undefined ? [] : [line];
  });
}
