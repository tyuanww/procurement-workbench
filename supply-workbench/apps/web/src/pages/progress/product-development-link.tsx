import { Button, Form, Input, Select } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import type { ProductDevelopmentNode } from '@sw/contracts';
import { isFactoryDevelopmentDestination, type ProductDevelopmentStore } from '@sw/domain';
import { apiErrorMessage } from '../../shared/api/client.js';
import { findDevelopmentMaterials, findDevelopmentOrders, linkDevelopmentNode } from './product-development-api.js';
import { SaveButton, useDevelopmentSave, type Saved } from './product-development-forms.js';

type Options<T> = { readonly value: T; readonly label: string }[];
type OrderOptions = Options<string>;
type Lookup = { readonly search: string; readonly attempt: number };
type Fields = { readonly orderLineId: string; readonly procurementLineId?: string };

export function DevelopmentLinkForm({ node, store, saved }: {
  readonly node: ProductDevelopmentNode; readonly store: ProductDevelopmentStore; readonly saved: Saved;
}): ReactNode {
  const [linkForm] = Form.useForm<Fields>();
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const selected = Form.useWatch('orderLineId', linkForm);
  const shouldChooseMaterial = isFactoryDevelopmentDestination(node.destination);
  const orders = useDevelopmentOptions(lookup === null ? null : `${lookup.attempt}:${lookup.search}`,
    (signal) => lookup === null ? Promise.resolve([]) : findDevelopmentOrders({ store, search: lookup.search, signal })
      .then((rows) => rows.map((row) => ({ value: row.orderLineId, label: `${row.oaRef} · ${orderLabel(row)}` }))));
  const materials = useDevelopmentOptions(shouldChooseMaterial && selected !== undefined ? selected : null,
    (signal) => selected === undefined ? Promise.resolve([]) : findDevelopmentMaterials({ store, orderLineId: selected, signal })
      .then((rows) => rows.map((row) => ({ value: row.orderLineId, label: orderLabel(row) }))));
  const save = useDevelopmentSave(saved);
  return <>
    <OrderLookup onSearch={(search) => {
      linkForm.resetFields();
      setLookup((previous) => ({ search, attempt: previous === null ? 0 : previous.attempt + 1 }));
    }} />
    <Form<Fields> form={linkForm} name="development-node-link" layout="vertical"
      onFinish={(fields) => void save.save(() => linkDevelopmentNode({
        nodeId: node.id, projectId: node.projectId, orderLineId: fields.orderLineId, procurementLineId: fields.procurementLineId ?? null,
      }))}>
      <Form.Item label="正式 OA 订单行" name="orderLineId" rules={[{ required: true }]}>
        <Select options={orders.options} loading={orders.isLoading} notFoundContent="未找到本店的有效 OA 行"
          onChange={() => linkForm.setFieldValue('procurementLineId', undefined)} />
      </Form.Item>
      {shouldChooseMaterial ? <Form.Item label="交付到厂的子件采购事项" name="procurementLineId" rules={[{ required: true }]}>
        <Select options={materials.options} loading={materials.isLoading} disabled={selected === undefined} notFoundContent="订单暂无本店已确认的子件" />
      </Form.Item> : null}
      <SaveButton isSaving={save.isSaving} error={save.error || orders.error || materials.error} label="确认关联"
        disabled={selected === undefined || materials.isLoading || orders.isLoading} />
    </Form>
  </>;
}

function OrderLookup({ onSearch }: { readonly onSearch: (search: string) => void }): ReactNode {
  return <Form<{ readonly oa: string }> name="development-order-lookup" layout="vertical" onFinish={({ oa }) => onSearch(oa.trim())}>
    <Form.Item label="搜索 OA 编号" name="oa" rules={[{ required: true, min: 2, whitespace: true }]}>
      <Input maxLength={120} autoFocus />
    </Form.Item>
    <Button htmlType="submit" style={{ marginBottom: 16 }}>查找订单</Button>
  </Form>;
}

function orderLabel({ itemName, itemCode, poRaw }: {
  readonly itemName: string | null; readonly itemCode: string | null; readonly poRaw: string | null;
}): string {
  return [itemName, itemCode, poRaw].filter((value) => value !== null && value !== '').join(' · ') || '未命名订单行';
}

function useDevelopmentOptions(key: string | null, query: (signal: AbortSignal) => Promise<OrderOptions>) {
  const [result, setResult] = useState<{ readonly key: string; readonly options: OrderOptions; readonly error: string }>();
  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    void query(controller.signal).then((options) => {
      if (!controller.signal.aborted) setResult({ key, options, error: '' });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setResult({ key, options: [], error: apiErrorMessage(error) ?? '读取订单失败，请重试' });
    });
    return () => controller.abort();
  }, [key]); // 本次查询由店内对话框和查询键确定。
  return {
    options: result?.key === key ? result.options : [],
    error: result?.key === key ? result.error : '',
    isLoading: key !== null && result?.key !== key,
  };
}
