import { Button, Descriptions, Empty, Image, Modal, Result, Skeleton, Space, Table, Typography } from 'antd';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import {
  type ProductMaterials,
  type ProductOverview,
  type ProductPurchases,
  type ProductStock,
} from '@sw/contracts';
import { missingReasonLabel } from '@sw/domain';
import { imageLabel, materialsCopy, purchaseStageButtons, stockMissingText, templateCells, type TemplateInput } from '../../features/product-archive/index.js';
import { useCanWrite } from '../../shared/actor.js';
import { formatQuantity } from '../../shared/ui/format.js';
import { StatusTag } from '../../shared/ui/widgets.js';

export type ProductCardLoad =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'error'; readonly message: string };

export function ProductDetailBody(props: {
  readonly overview: ProductOverview | null;
  readonly purchases: ProductPurchases | null;
  readonly stock: ProductStock | null;
  readonly materials: ProductMaterials | null;
  readonly imageIndex: number | null;
  readonly setImageIndex: (index: number | null) => void;
  readonly card: string | null;
  readonly cardLoad: ProductCardLoad;
  readonly onRetryCard: () => void;
  readonly scope: string;
  readonly stage: string | null;
  readonly setParams: (params: Record<string, string>) => void;
}) {
  const visible = (props.overview?.images ?? []).filter((image) => !image.hidden);
  const rows = (props.purchases?.rows ?? []).filter((row) => props.stage === null || row.orderLine.stage === props.stage);
  return (
    <>
      <TemplateTable input={templateOf(props.overview, visible.length)} />
      <CardButtons card={props.card} scope={props.scope} setParams={props.setParams} />
      <ImageStrip visible={visible} imageIndex={props.imageIndex} setImageIndex={props.setImageIndex} />
      <DetailCards card={props.card} cardLoad={props.cardLoad} onRetryCard={props.onRetryCard} scope={props.scope} rows={rows} purchases={props.purchases} overview={props.overview} stock={props.stock} materials={props.materials} setParams={props.setParams} />
    </>
  );
}

export function TemplateTable({ input }: { readonly input: TemplateInput }) {
  return (
    <Descriptions
      bordered
      size="small"
      column={{ xs: 1, sm: 2 }}
      items={templateCells(input).map((cell) => ({ key: cell.label, label: cell.label, children: cell.value }))}
    />
  );
}

export function productHeading(overview: ProductOverview | null): string {
  return `产品 ${skuTitle(overview)}`;
}

function skuTitle(overview: ProductOverview | null): string {
  return overview?.product.skuName.value ?? '待补充';
}

function templateOf(overview: ProductOverview | null, imageCount: number): TemplateInput {
  return {
    filingName: overview?.product.filingName.value ?? null,
    skuName: overview?.product.skuName.value ?? null,
    barcode: overview?.product.barcodeRaw ?? null,
    image: imageCount === 0 ? null : '已有图片',
    supplier: null,
    cycle: null,
  };
}

function CardButtons(props: { readonly card: string | null; readonly scope: string; readonly setParams: (params: Record<string, string>) => void }) {
  return (
    <Space wrap style={{ marginTop: 12 }}>
      <Button type={props.card === 'purchases' ? 'primary' : 'default'} aria-pressed={props.card === 'purchases'} onClick={() => props.setParams({ card: 'purchases', scope: props.scope })}>采购</Button>
      <Button type={props.card === 'stock' ? 'primary' : 'default'} aria-pressed={props.card === 'stock'} onClick={() => props.setParams({ card: 'stock' })}>库存</Button>
      <Button type={props.card === 'materials' ? 'primary' : 'default'} aria-pressed={props.card === 'materials'} onClick={() => props.setParams({ card: 'materials' })}>组成物料</Button>
    </Space>
  );
}

function ImageStrip(props: {
  readonly visible: readonly ProductOverview['images'][number][];
  readonly imageIndex: number | null;
  readonly setImageIndex: (index: number | null) => void;
}) {
  const { visible, imageIndex, setImageIndex } = props;
  return (
    <>
      {visible.length === 0 ? <p>{imageLabel(false)}</p> : <Button onClick={() => setImageIndex(0)}>{imageLabel(true)}</Button>}
      <Modal
        open={imageIndex !== null && visible[imageIndex] !== undefined}
        title="产品图片"
        onCancel={() => setImageIndex(null)}
        footer={[
          <Button key="prev" onClick={() => setImageIndex(imageIndex === null || imageIndex === 0 ? visible.length - 1 : imageIndex - 1)}>上一张</Button>,
          <Button key="next" onClick={() => setImageIndex(imageIndex === null || imageIndex + 1 >= visible.length ? 0 : imageIndex + 1)}>下一张</Button>,
          <Button key="close" type="primary" onClick={() => setImageIndex(null)}>关闭</Button>,
        ]}
      >
        {imageIndex === null || visible[imageIndex] === undefined ? null : (
          <Image alt="" src={`/files/${visible[imageIndex].fileId}`} style={{ width: '100%' }} />
        )}
      </Modal>
    </>
  );
}

function DetailCards(props: {
  readonly card: string | null;
  readonly cardLoad: ProductCardLoad;
  readonly onRetryCard: () => void;
  readonly scope: string;
  readonly rows: readonly ProductPurchases['rows'][number][];
  readonly purchases: ProductPurchases | null;
  readonly overview: ProductOverview | null;
  readonly stock: ProductStock | null;
  readonly materials: ProductMaterials | null;
  readonly setParams: (params: Record<string, string>) => void;
}) {
  return (
    <>
      {props.card !== 'purchases' ? null : <CardState state={props.cardLoad} onRetry={props.onRetryCard}><PurchasesPanel scope={props.scope} rows={props.rows} purchases={props.purchases} setParams={props.setParams} /></CardState>}
      {props.card !== 'stock' ? null : <CardState state={props.cardLoad} onRetry={props.onRetryCard}><StockPanel overview={props.overview} stock={props.stock} /></CardState>}
      {props.card !== 'materials' ? null : <CardState state={props.cardLoad} onRetry={props.onRetryCard}><MaterialsPanel materials={props.materials} /></CardState>}
    </>
  );
}

function CardState(props: { readonly state: ProductCardLoad; readonly onRetry: () => void; readonly children: ReactNode }) {
  if (props.state.kind === 'loading' || props.state.kind === 'idle') return <Skeleton active paragraph={{ rows: 2 }} />;
  if (props.state.kind === 'error') return <Result status="error" title="区块没有读出来。" subTitle={props.state.message} extra={<Button type="primary" onClick={props.onRetry}>重试</Button>} />;
  return props.children;
}

function PurchasesPanel(props: {
  readonly scope: string;
  readonly rows: readonly ProductPurchases['rows'][number][];
  readonly purchases: ProductPurchases | null;
  readonly setParams: (params: Record<string, string>) => void;
}) {
  return (
    <div id="purchases">
      <Space wrap>
        <Button onClick={() => props.setParams({ card: 'purchases', scope: props.scope === 'exact' ? 'all_channels' : 'exact' })}>{props.scope === 'exact' ? '全部渠道' : '只看本条码'}</Button>
        {(props.purchases === null ? [] : purchaseStageButtons(props.purchases.byStage)).map((button) => <Button key={button.code} onClick={() => props.setParams({ card: 'purchases', scope: props.scope, stage: button.code })}>{button.text}</Button>)}
      </Space>
      <Typography.Paragraph style={{ marginTop: 12 }}>采购 {props.rows.length} 行</Typography.Paragraph>
      <Table<ProductPurchases['rows'][number]>
        size="small" rowKey={(row) => row.orderLine.id} pagination={false} dataSource={props.rows} scroll={{ x: 420 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="此范围没有采购记录。" /> }}
        columns={[
          { title: '单号', key: 'po', render: (_, { orderLine }) => <Link to={`/lines/${encodeURIComponent(orderLine.id)}`}>{orderLine.po.poRaw ?? '查看订单行'}</Link> },
          { title: '品名', key: 'name', render: (_, { orderLine }) => orderLine.nameRaw ?? '—' },
          { title: '阶段', key: 'stage', render: (_, { orderLine }) => <StatusTag status={orderLine.stage} /> },
        ]}
      />
    </div>
  );
}

function StockPanel({ overview, stock }: { readonly overview: ProductOverview | null; readonly stock: ProductStock | null }) {
  const canReview = useCanWrite('master.review');
  const card = overview?.cards.stock;
  if (card?.kind === 'missing') {
    const reason = missingReasonLabel(card.reason);
    return (
      <div id="stock">
        <p>{canReview ? stockMissingText(reason) : `${reason}。`}</p>
        {canReview ? <Link to="/master">去主数据审核</Link> : null}
      </div>
    );
  }
  if (stock === null) return <Skeleton active paragraph={{ rows: 2 }} />;
  const { rows } = stock.factory;
  return (
    <div id="stock">
      <Typography.Paragraph>库存 {rows.length} 行</Typography.Paragraph>
      <FactoryStockTable rows={rows} />
    </div>
  );
}

function FactoryStockTable({ rows }: { readonly rows: ProductStock['factory']['rows'] }) {
  return (
    <Table<ProductStock['factory']['rows'][number]>
      size="small" rowKey="id" pagination={false} dataSource={rows} scroll={{ x: 420 }}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有可显示的工厂库存记录。" /> }}
      columns={[
        { title: '物料编码', key: 'code', render: (_, row) => row.payload.itemCodeRaw.value ?? '—' },
        { title: '库存数量', key: 'quantity', align: 'right', render: (_, row) => formatQuantity(row.payload.qtyOnHand.value) },
        { title: '来源', key: 'source', render: (_, row) => `${row.sheetName} · 第 ${row.rowNo} 行` },
      ]}
    />
  );
}

function MaterialsPanel({ materials }: { readonly materials: ProductMaterials | null }) {
  return (
    <div id="materials">
      <Typography.Paragraph type="secondary">{materialsCopy()}</Typography.Paragraph>
      {materials === null ? <Skeleton active paragraph={{ rows: 2 }} /> : !('parts' in materials)
        ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有 BOM" /> : <MaterialsTable parts={materials.parts} />}
    </div>
  );
}

type MaterialPart = Extract<ProductMaterials, { readonly parts: unknown }>['parts'][number];

function MaterialsTable({ parts }: { readonly parts: readonly MaterialPart[] }) {
  return (
    <>
      <Typography.Paragraph>子件 {parts.length}</Typography.Paragraph>
      <Table
        size="small" rowKey="index" pagination={false} dataSource={parts.map((part, index) => ({ ...part, index }))} scroll={{ x: 320 }}
        columns={[
          { title: '子件编码', dataIndex: 'partCodeRaw', key: 'code' },
          { title: '子件名称', dataIndex: 'partName', key: 'name' },
        ]}
      />
    </>
  );
}
