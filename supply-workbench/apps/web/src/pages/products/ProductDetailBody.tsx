import { Button, Descriptions, Empty, Flex, Image, Modal, Result, Select, Skeleton, Table, Typography } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  ProductMaterialsSchema,
  ProductPurchasesSchema,
  ProductStockSchema,
  type ProductMaterials,
  type ProductOverview,
  type ProductPurchases,
  type ProductStock,
} from '@sw/contracts';
import { missingReasonLabel } from '@sw/domain';
import { imageLabel, isChannelVariant, materialsCopy, purchaseStageButtons, stockMissingText, templateCells, type TemplateInput } from '../../features/product-archive/index.js';
import { useCanWrite } from '../../shared/actor.js';
import { apiGetWithSignal } from '../../shared/api/client.js';
import { failureText, readFailureOf } from '../../shared/api/reads.js';
import { formatQuantity } from '../../shared/ui/format.js';
import { ContentTabs, ViewSwitch } from '../../shared/ui/view-switch.js';
import { StatusTag } from '../../shared/ui/widgets.js';
import { space } from '../../theme/tokens.js';
import { ProductVariantTag } from './product-cards.js';

type ProductPanelLoad<T> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly value: T }
  | { readonly kind: 'error'; readonly message: string };

type ProductDetailInput = {
  readonly id: string;
  readonly overview: ProductOverview;
  readonly search: URLSearchParams;
  readonly patch: (params: Record<string, string | null>) => void;
};

export function ProductDetailBody({ id, overview, search, patch }: ProductDetailInput) {
  const path = `/api/v1/products/${encodeURIComponent(id)}`;
  const items = [
    { key: 'archive', label: '档案', children: <ArchivePanel overview={overview} /> },
    { key: 'purchases', label: '采购', children: <PurchaseTab path={path} search={search} patch={patch} /> },
    { key: 'stock', label: '库存', children: <ProductPanel path={`${path}/stock`} schema={ProductStockSchema}>
      {(stock) => <StockPanel overview={overview} stock={stock} />}
    </ProductPanel> },
    { key: 'materials', label: '组成物料', children: <ProductPanel path={`${path}/materials`} schema={ProductMaterialsSchema}>
      {(materials) => <MaterialsPanel materials={materials} />}
    </ProductPanel> },
  ];
  const activeKey = items.find(({ key }) => key === search.get('card'))?.key ?? 'archive';
  return <Flex vertical gap={space[2]}>
    <ProductPackaging product={overview.product} />
    <ContentTabs aria-label="产品详情内容" destroyOnHidden items={items} activeKey={activeKey}
      onChange={(key) => patch({ card: key === 'archive' ? null : key })} />
  </Flex>;
}

function ProductPackaging({ product }: { readonly product: ProductOverview['product'] }) {
  return <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 4 }} items={[
    { key: 'variant', label: '规格', children: <ProductVariantTag isChannelVariant={isChannelVariant(product.barcodeRaw)} /> },
    { key: 'barcode', label: '条码', children: product.barcodeRaw },
    { key: 'content', label: '净含量', children: product.netContent.value ?? '—' },
    { key: 'case', label: '箱规', children: product.casePack.value ?? '—' },
  ]} styles={{ content: { overflowWrap: 'anywhere' } }} />;
}

function ArchivePanel({ overview }: { readonly overview: ProductOverview }) {
  const [imageIndex, setImageIndex] = useState<number | null>(null);
  const visible = overview.images.filter((image) => !image.hidden);
  return (
    <Flex vertical gap={space[2]}>
      <TemplateTable input={templateOf(overview, visible.length)} />
      {visible.length === 0 ? null : <div><ImageStrip visible={visible} imageIndex={imageIndex} setImageIndex={setImageIndex} /></div>}
    </Flex>
  );
}

function TemplateTable({ input }: { readonly input: TemplateInput }) {
  return (
    <Descriptions
      bordered
      size="small"
      column={{ xs: 1, sm: 2 }}
      items={templateCells(input).filter((cell) => cell.label !== '条码')
        .map((cell) => ({ key: cell.label, label: cell.label, children: cell.value }))}
    />
  );
}

export function productHeading(overview: ProductOverview | null): string {
  return `产品 ${skuTitle(overview)}`;
}

function skuTitle(overview: ProductOverview | null): string {
  return overview?.product.skuName.value ?? '待补充';
}

function templateOf(overview: ProductOverview, imageCount: number): TemplateInput {
  return {
    filingName: overview.product.filingName.value,
    skuName: overview.product.skuName.value,
    image: imageCount === 0 ? imageLabel(false) : '已有图片',
    supplier: null,
    cycle: null,
  };
}

function ImageStrip(props: {
  readonly visible: readonly ProductOverview['images'][number][];
  readonly imageIndex: number | null;
  readonly setImageIndex: (index: number | null) => void;
}) {
  const { visible, imageIndex, setImageIndex } = props;
  return (
    <>
      <Button onClick={() => setImageIndex(0)}>{imageLabel(true)}</Button>
      <Modal
        open={imageIndex !== null && visible[imageIndex] !== undefined}
        title="产品图片"
        onCancel={() => setImageIndex(null)}
        footer={[
          <Button key="prev" onClick={() => setImageIndex(imageIndex === null || imageIndex === 0 ? visible.length - 1 : imageIndex - 1)}>上一张</Button>,
          <Button key="next" onClick={() => setImageIndex(imageIndex === null || imageIndex + 1 >= visible.length ? 0 : imageIndex + 1)}>下一张</Button>,
          <Button key="close" onClick={() => setImageIndex(null)}>关闭</Button>,
        ]}
      >
        {imageIndex === null || visible[imageIndex] === undefined ? null : (
          <Image alt="" src={`/files/${visible[imageIndex].fileId}`} style={{ width: '100%' }} />
        )}
      </Modal>
    </>
  );
}

function ProductPanel<T>({ path, schema, children }: {
  readonly path: string;
  readonly schema: Parameters<typeof apiGetWithSignal<T>>[0]['schema'];
  readonly children: (value: T) => ReactNode;
}) {
  const [state, setState] = useState<ProductPanelLoad<T>>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void apiGetWithSignal({ path, schema, signal }).then(
      (value) => { if (!signal.aborted) setState({ kind: 'ready', value }); },
      (error: unknown) => {
        if (signal.aborted) return;
        const failure = readFailureOf(error);
        setState({ kind: 'error', message: failure === null ? '请重试。' : failureText(failure) });
      },
    );
    return () => controller.abort();
  }, [path, schema, attempt]);
  if (state.kind === 'loading') return <Skeleton active paragraph={{ rows: 2 }} />;
  if (state.kind === 'error') return <Result status="error" title="该页签没有读出来" subTitle={state.message} extra={
    <Button type="primary" onClick={() => {
      setState({ kind: 'loading' });
      setAttempt((value) => value + 1);
    }}>重试</Button>
  } />;
  return children(state.value);
}

function PurchaseTab({ path, search, patch }: Pick<ProductDetailInput, 'search' | 'patch'> & { readonly path: string }) {
  const scope = search.get('scope') === 'exact' ? 'exact' : 'all_channels';
  const url = `${path}/purchases?scope=${scope}`;
  return <Flex vertical align="start" gap={space[2]}>
    <ViewSwitch<ProductPurchases['scope']> aria-label="采购条码范围" value={scope} onChange={(value) => patch({ scope: value })}
      options={[{ label: '全部渠道', value: 'all_channels' }, { label: '只看本条码', value: 'exact' }]} />
    <ProductPanel key={url} path={url} schema={ProductPurchasesSchema}>
      {(purchases) => <PurchasesPanel purchases={purchases} stage={search.get('stage')} patch={patch} />}
    </ProductPanel>
  </Flex>;
}

function PurchasesPanel(props: {
  readonly stage: string | null;
  readonly purchases: ProductPurchases;
  readonly patch: ProductDetailInput['patch'];
}) {
  const stages = purchaseStageButtons(props.purchases.byStage);
  const stage = stages.find(({ code }) => code === props.stage)?.code ?? null;
  const rows = props.purchases.rows.filter(({ orderLine }) => stage === null || orderLine.stage === stage);
  return (
    <div id="purchases" style={{ width: '100%' }}>
      <Select<string> aria-label="采购阶段" value={stage ?? ''} virtual={false} onChange={(value) => props.patch({ stage: value })}
        options={[{ label: '全部阶段', value: '' }, ...stages.map(({ code, text }) => ({ label: text, value: code }))]} />
      <Typography.Paragraph style={{ marginTop: space[3] }}>采购 {rows.length} 行</Typography.Paragraph>
      <Table<ProductPurchases['rows'][number]>
        size="small" rowKey={(row) => row.orderLine.id} pagination={false} dataSource={rows} scroll={{ x: 420 }}
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

function StockPanel({ overview, stock }: { readonly overview: ProductOverview; readonly stock: ProductStock }) {
  const canReview = useCanWrite('master.review');
  const card = overview.cards.stock;
  if (card?.kind === 'missing') {
    const reason = missingReasonLabel(card.reason);
    return (
      <div id="stock">
        <p>{canReview ? stockMissingText(reason) : `${reason}。`}</p>
        {canReview ? <Link to="/master">去主数据审核</Link> : null}
      </div>
    );
  }
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

function MaterialsPanel({ materials }: { readonly materials: ProductMaterials }) {
  return (
    <div id="materials">
      <Typography.Paragraph type="secondary">{materialsCopy()}</Typography.Paragraph>
      {!('parts' in materials)
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
