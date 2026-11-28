import { Button, Descriptions, Drawer } from 'antd';
import type { ProductPurchases } from '@sw/contracts';
import { channelMatchLabel } from '@sw/domain';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { useCan } from '../../shared/actor.js';
import { StatusTag } from '../../shared/ui/widgets.js';
import { drawerWidth, space } from '../../theme/tokens.js';
import { ProductDrillLink, productNavigationState } from './product-journey.js';

type PurchaseRow = ProductPurchases['rows'][number];
const recordParam = 'purchaseRecord';
const triggerId = (lineId: string) => `product-purchase:${lineId}`;

export function useProductPurchaseSelection() {
  const { state } = useLocation();
  const [params, setParams] = useSearchParams();
  const lineId = params.get(recordParam);
  const prior = useRef(lineId);
  useEffect(() => {
    const previous = prior.current;
    prior.current = lineId;
    if (previous === null || lineId !== null) return;
    const frame = window.requestAnimationFrame(() => document.getElementById(triggerId(previous))?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [lineId]);
  return {
    lineId,
    select(id: string | null) {
      setParams((current) => {
        const next = new URLSearchParams(current);
        if (id === null) next.delete(recordParam);
        else next.set(recordParam, id);
        return next;
      }, { replace: true, preventScrollReset: true, state: productNavigationState(state) });
    },
  };
}

export function ProductPurchaseTrigger({ row, onOpen }: { readonly row: PurchaseRow; readonly onOpen: (id: string) => void }) {
  const { orderLine } = row;
  return <Button type="link" id={triggerId(orderLine.id)} aria-haspopup="dialog" onClick={() => onOpen(orderLine.id)}
    style={{ padding: 0, height: 'auto', minHeight: 32, whiteSpace: 'normal', maxWidth: '100%', overflowWrap: 'anywhere' }}>
    {orderLine.po.poRaw ?? '查看采购记录'}
  </Button>;
}

export function ProductPurchaseDrawer({ row, onClose }: { readonly row: PurchaseRow; readonly onClose: () => void }) {
  const [isShown, setShown] = useState(false);
  const canReadLine = useCan('data.read');
  const { orderLine, channelMatch } = row;
  return <Drawer open title="采购记录" size={`min(${drawerWidth}px, 100vw)`} onClose={onClose}
    afterOpenChange={setShown} focusable={{ trap: true, focusTriggerAfterClose: false }}>
    <Descriptions size="small" column={1} items={[
      { key: 'po', label: '采购单号', children: orderLine.po.poRaw ?? '无单号' },
      { key: 'product', label: '品名', children: orderLine.nameRaw ?? '未填写' },
      { key: 'barcode', label: '采购条码', children: orderLine.barcodeRaw ?? '未填写' },
      { key: 'channel', label: '规格关系', children: channelMatchLabel(channelMatch) },
      { key: 'stage', label: '采购阶段', children: <StatusTag status={orderLine.stage} /> },
    ]} />
    {canReadLine ? <div style={{ marginTop: space[2] }}>
      <ProductDrillLink to={`/lines/${encodeURIComponent(orderLine.id)}`} tabLabel="采购" isFocusReady={isShown}
        sourceLink={`product-purchase-order:${orderLine.id}`}>核对订单记录</ProductDrillLink>
    </div> : null}
  </Drawer>;
}
