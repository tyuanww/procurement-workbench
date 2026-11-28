import { Button, Descriptions, Drawer } from 'antd';
import type { ProductPurchases } from '@sw/contracts';
import { channelMatchLabel } from '@sw/domain';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { useCan } from '../../shared/actor.js';
import { formatQuantity } from '../../shared/ui/format.js';
import { StatusTag } from '../../shared/ui/widgets.js';
import { drawerWidth } from '../../theme/tokens.js';
import { purchaseRecordParam } from './product-edit-url.js';
import { ProductDrillLink, productNavigationState } from './product-journey.js';

type PurchaseRow = ProductPurchases['rows'][number];
const triggerId = (lineId: string) => `product-purchase:${lineId}`;

type PurchaseSelection = {
  readonly lineId: string | null;
  readonly isAvailable: boolean;
  readonly fallback: RefObject<{ focus: () => void } | null>;
};

export function useProductPurchaseSelection({ lineId, isAvailable, fallback }: PurchaseSelection) {
  const { state } = useLocation();
  const [, setParams] = useSearchParams();
  const [hasUnavailableRecord, setUnavailable] = useState(false);
  const restore = useRef<string | null>(null);
  const writeSelection = useCallback((id: string | null) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (id === null) next.delete(purchaseRecordParam);
      else next.set(purchaseRecordParam, id);
      return next;
    }, { replace: true, preventScrollReset: true, state: productNavigationState(state) });
  }, [setParams, state]);
  useEffect(() => {
    if (lineId !== null && !isAvailable) {
      restore.current = lineId;
      setUnavailable(true);
      writeSelection(null);
      return;
    }
    const previous = restore.current;
    if (lineId !== null || previous === null) return;
    const frame = window.requestAnimationFrame(() => {
      restore.current = null;
      (document.getElementById(triggerId(previous)) ?? fallback.current)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fallback, isAvailable, lineId, writeSelection]);
  return {
    hasUnavailableRecord,
    select(id: string | null) {
      restore.current = id === null ? lineId : null;
      setUnavailable(false);
      writeSelection(id);
    },
  };
}

export function ProductPurchaseTrigger({ row, onOpen }: { readonly row: PurchaseRow; readonly onOpen: (id: string) => void }) {
  const { orderLine } = row;
  return <Button type="link" id={triggerId(orderLine.id)} className="dossier-purchase-trigger" aria-haspopup="dialog" onClick={() => onOpen(orderLine.id)}>
    {orderLine.po.poRaw ?? '查看采购记录'}
  </Button>;
}

export function ProductPurchaseDrawer({ row, onClose }: { readonly row: PurchaseRow; readonly onClose: () => void }) {
  const [isShown, setShown] = useState(false);
  const canReadLine = useCan('data.read');
  const { orderLine, channelMatch } = row;
  return <Drawer open title="采购记录" className="dossier-purchase-drawer" size={`min(${drawerWidth}px, 100vw)`} onClose={onClose}
    afterOpenChange={setShown} focusable={{ trap: true, focusTriggerAfterClose: false }}>
    <Descriptions size="small" column={1} items={[
      { key: 'po', label: '采购单号', children: orderLine.po.poRaw ?? '无单号' },
      { key: 'product', label: '品名', children: orderLine.nameRaw ?? '未填写' },
      { key: 'barcode', label: '采购条码', children: orderLine.barcodeRaw ?? '未填写' },
      { key: 'code', label: '物料编码', children: orderLine.itemCodeRaw ?? '未填写' },
      { key: 'quantity', label: '采购数量', children: orderLine.qtyOrdered === null ? '未填写' : formatQuantity(orderLine.qtyOrdered) },
      { key: 'supplier', label: '供应商原文', children: orderLine.supplier.rawName ?? '未填写' },
      { key: 'channel', label: '规格关系', children: channelMatchLabel(channelMatch) },
      { key: 'stage', label: '当前采购阶段', children: <StatusTag status={orderLine.stage} /> },
    ]} />
    {canReadLine ? <div className="dossier-purchase-action">
      <ProductDrillLink to={`/lines/${encodeURIComponent(orderLine.id)}`} tabLabel="采购" isFocusReady={isShown}
        sourceLink={`product-purchase-order:${orderLine.id}`}>核对订单记录</ProductDrillLink>
    </div> : null}
  </Drawer>;
}
