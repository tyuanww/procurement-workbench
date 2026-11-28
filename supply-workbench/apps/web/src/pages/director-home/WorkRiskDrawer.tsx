import { Alert, Card, Descriptions, Drawer, Empty, Flex, Tag, Typography } from 'antd';
import type { ProcurementStore } from '@sw/contracts';
import type { LocalDate } from '@sw/domain';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { DELIVERY_RISK_REASONS, deliveryRiskReasons, homeDeliveryRiskAddress } from '../../features/follow-up/index.js';
import { useDetailFocusLink, useDetailReturnFocus } from '../../shared/hooks/detail-return-focus.js';
import { MissingValue } from '../../shared/ui/widgets.js';
import { drawerWidth, space } from '../../theme/tokens.js';
import { homeAddress, HOME_RISK_GROUP_FOCUS, HOME_RISK_RETURN_PARAM, homeRiskLineFocus } from './home-location.js';
import { productName, type WorkRow } from './work-register.js';

type RiskSource = { readonly store: ProcurementStore; readonly search: string };

export function WorkRiskDrawer({ id, isOpen, rows, store, scopeLabel, today, search, onClose, onClosed }: {
  readonly id: string; readonly isOpen: boolean; readonly rows: readonly WorkRow[];
  readonly store: ProcurementStore | null; readonly scopeLabel: string; readonly today: LocalDate; readonly search: string;
  readonly onClose: () => void; readonly onClosed: () => void;
}) {
  const heading = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  const [isShown, setShown] = useState(false);
  const [isMissing, setMissing] = useState(false);
  useEffect(() => {
    if (isOpen) { wasOpen.current = true; return; }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    setMissing(false);
    const frame = window.requestAnimationFrame(onClosed);
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, onClosed]);
  useDetailReturnFocus(isOpen && isShown, { allowContainerFocus: true, fallback: { heading, onMissing: () => setMissing(true) } });
  const source = store === null ? null : { store, search };

  return <Drawer id={id} title={<Typography.Title level={2} ref={heading} tabIndex={-1} style={{ margin: 0, font: 'inherit' }}>交期风险</Typography.Title>}
    size={`min(${drawerWidth}px, 100vw)`} open={isOpen} destroyOnHidden
    closable={{ 'aria-label': '关闭交期风险' }} focusable={{ trap: true, focusTriggerAfterClose: false }} onClose={onClose}
    afterOpenChange={setShown}
    footer={source !== null && rows.length !== 0 ? <RiskGroupLink source={source} rows={rows} today={today} /> : null}>
    <Flex vertical gap={space[2]}>
      <Typography.Text type="secondary">{scopeLabel} · {today} · {rows.length} 件</Typography.Text>
      {isMissing ? <Alert type="warning" showIcon title="原记录已不在当前交期风险范围内，已保留首页筛选。" /> : null}
      {rows.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前店铺范围没有交期风险。" /> : <>
        {source === null ? <Alert type="info" title="该店铺暂不能按原范围查看订单。可在此核对风险原因和日期。" /> : null}
        <Flex component="ul" vertical gap={space[2]} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {rows.map((row) => <li key={row.line.id}><RiskOrder row={row} today={today} source={source} /></li>)}
        </Flex>
      </>}
    </Flex>
  </Drawer>;
}

function RiskOrder({ row, today, source }: {
  readonly row: WorkRow; readonly today: LocalDate; readonly source: RiskSource | null;
}) {
  const { line } = row;
  const due = line.nextDue;
  const { name, po, identity, subtitle } = orderIdentity(row);
  return <Card size="small" style={{ overflowWrap: 'anywhere' }}>
    <Flex vertical gap={space[2]}>
      <div>
        <Typography.Text strong>{name}</Typography.Text>
        <div><Typography.Text type="secondary">{subtitle}</Typography.Text></div>
      </div>
      <Flex wrap gap={space[1]}>{deliveryRiskReasons(line, today).map((reason) =>
        <Tag key={reason} color={reason === 'overdue' ? 'error' : 'warning'} style={{ marginInlineEnd: 0 }}>{DELIVERY_RISK_REASONS[reason]}</Tag>)}</Flex>
      <Descriptions size="small" column={1} items={[
        { key: 'confirmed', label: '采购确认到货日', children: due?.dateBuyerConfirmed ?? <MissingValue reason="not_provided" /> },
        { key: 'required', label: '对应需求日', children: due?.dateFactoryRequired ?? <MissingValue reason="not_provided" /> },
      ]} />
      {source === null ? null : <Flex wrap align="center" gap={space[2]}>
        <RiskOrderLink source={source} lineId={line.id} identity={identity} po={po} batchId={null} />
        {due === null ? null : <RiskOrderLink source={source} lineId={line.id} identity={identity} po={po} batchId={due.batchId} />}
      </Flex>}
    </Flex>
  </Card>;
}

function orderIdentity(row: WorkRow) {
  const { line } = row;
  const name = productName(row);
  const po = line.po.poRaw || '无单号';
  const code = line.itemCodeRaw ?? line.barcodeRaw;
  const kind = line.lane === 'finished' ? '成品' : '物料';
  return {
    name, po, identity: [po, name, code === name ? null : code].filter(Boolean).join(' · '),
    subtitle: [kind, po, code === name ? null : code].filter(Boolean).join(' · '),
  };
}

function RiskOrderLink({ source, lineId, identity, po, batchId }: {
  readonly source: RiskSource; readonly lineId: string; readonly identity: string; readonly po: string; readonly batchId: string | null;
}) {
  const href = new URLSearchParams({ store: source.store, [HOME_RISK_RETURN_PARAM]: source.search });
  if (batchId !== null) href.set('focusBatch', batchId);
  const link = useDetailFocusLink(homeAddress(new URLSearchParams(source.search)), homeRiskLineFocus(lineId, batchId));
  return <Link to={`/lines/${encodeURIComponent(lineId)}?${href}`} {...link}
    style={{ paddingBlock: space[1] }}
    aria-label={batchId === null ? `查看订单 ${identity}` : `查看下一要货批次 · ${identity}`}>
    {batchId === null ? `查看订单 ${po}` : '查看下一要货批次'}
  </Link>;
}

function RiskGroupLink({ source, rows, today }: { readonly source: RiskSource; readonly rows: readonly WorkRow[]; readonly today: LocalDate }) {
  const target = homeDeliveryRiskAddress({ store: source.store, date: today, ids: rows.map(({ line }) => line.id),
    returnQuery: new URLSearchParams({ [HOME_RISK_RETURN_PARAM]: source.search }) });
  const link = useDetailFocusLink(homeAddress(new URLSearchParams(source.search)), HOME_RISK_GROUP_FOCUS);
  return <Flex justify="end"><Link to={target} {...link} style={{ paddingBlock: space[1] }}>查看这组订单</Link></Flex>;
}
