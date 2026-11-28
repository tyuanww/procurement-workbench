import { productSection, productSectionLabels } from './product-section.js';
import { Alert, Button, Descriptions, Empty, Flex, Image, Modal, Result, Select, Skeleton, Table, Typography } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { ProductDrillLink } from './product-journey.js';
import {
  ProductMaterialsSchema,
  ProductPurchasesSchema,
  ProductStockSchema,
  type ProductMaterials,
  type ProductOverview,
  type ProductPurchases,
  type ProductStock,
} from '@sw/contracts';
import { channelMatchLabel, imageSlotLabel, lineStageText } from '@sw/domain';
import { isChannelVariant } from '../../features/product-archive/index.js';
import { useCan } from '../../shared/actor.js';
import { apiGetWithSignal } from '../../shared/api/client.js';
import { failureText, readFailureOf } from '../../shared/api/reads.js';
import { formatQuantity } from '../../shared/ui/format.js';
import { ContentTabs, ViewSwitch } from '../../shared/ui/view-switch.js';
import { StatusTag } from '../../shared/ui/widgets.js';
import { space } from '../../theme/tokens.js';
import { ProductVariantTag } from './product-cards.js';
import { ProductPurchaseDrawer, ProductPurchaseTrigger, useProductPurchaseSelection } from './ProductPurchaseDrawer.js';
import { OwnerNameForm } from './product-owner-editor.js';

type ProductPanelLoad<T> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly value: T }
  | { readonly kind: 'error'; readonly message: string };

type ProductDetailInput = {
  readonly id: string;
  readonly overview: ProductOverview;
  readonly search: URLSearchParams;
  readonly archiveRevision?: number;
  readonly patch: (params: Record<string, string | null>) => void;
};

export function ProductDetailBody({ id, overview, search, archiveRevision, patch }: ProductDetailInput) {
  const path = `/api/v1/products/${encodeURIComponent(id)}`;
  const openSection: ProductDetailInput['patch'] = params => {
    patch(params);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.dossier-detail [role="tab"][aria-selected="true"]')?.focus());
  };
  const items = [
    { key: 'archive', label: productSectionLabels.archive, children: <ArchivePanel overview={overview} patch={openSection} /> },
    { key: 'purchases', label: productSectionLabels.purchases, children: <PurchaseTab path={path} search={search} patch={patch} /> },
    { key: 'stock', label: productSectionLabels.stock, children: <ProductPanel path={`${path}/stock`} schema={ProductStockSchema}>
      {(stock) => <StockPanel overview={overview} stock={stock} patch={openSection} />}
    </ProductPanel> },
    { key: 'materials', label: productSectionLabels.materials, children: <ProductPanel key={archiveRevision} path={`${path}/materials?owners=1`} schema={ProductMaterialsSchema}>
      {(materials) => <MaterialsPanel productId={id} materials={materials} />}
    </ProductPanel> },
  ];
  const activeKey = productSection(search);
  return <Flex vertical gap={space[2]}>
    <ProductPackaging overview={overview} />
    <ContentTabs tabBarGutter={16} aria-label="产品详情内容" destroyOnHidden items={items} activeKey={activeKey}
      onChange={(key) => patch({ card: key === 'archive' ? null : key })} />
  </Flex>;
}

function ProductPackaging({ overview }: Pick<ProductDetailInput, 'overview'>) {
  const { product, ownerName } = overview;
  return <dl className="dossier-identity">
    <div><dt>规格</dt><dd><ProductVariantTag isChannelVariant={isChannelVariant(product.barcodeRaw)} /></dd></div>
    <div><dt>条码</dt><dd>{product.barcodeRaw}</dd></div>
    <div><dt>净含量</dt><dd>{product.netContent.value ?? '—'}</dd></div>
    <div><dt>箱规</dt><dd>{product.casePack.value ?? '—'}</dd></div>
    <div><dt>项目推荐人</dt><dd>{ownerName ?? '未指定'}</dd></div>
  </dl>;
}

function ArchivePanel({ overview, patch }: Pick<ProductDetailInput, 'overview' | 'patch'>) {
  const { purchases, stock, materials } = overview.cards;
  const total = Object.values(purchases.byStage).reduce((sum, n) => sum + n, 0);
  const entries = [
    { key: 'purchases', title: '采购订单', value: `全部渠道 · ${total} 行` },
    { key: 'stock', title: '工厂库存', value: stock.kind === 'linked' ? `${stock.rowCount} 行来源记录` : '暂无匹配记录' },
    { key: 'materials', title: '组成物料', value: materials.kind === 'no_bom' ? '暂无 BOM' : `${materials.partCount} 行子件` },
  ];
  const product = overview.product;
  const fields = [
    { key: 'filingName', label: '备案名称', children: product.filingName.value ?? '待补充' },
    { key: 'filingNo', label: '备案编号', children: product.filingNo.value ?? '待补充' },
    { key: 'line', label: '产品线', children: product.productLine.value ?? '待补充' },
    { key: 'size', label: '外包装尺寸（mm）', children: product.outerSize.value ?? '待补充' },
  ];
  return <>
    <div className="dossier-archive-layout">
      <PackagingImages overview={overview} />
      <section aria-label="备案与包装">
        <Typography.Title level={2}>备案与包装</Typography.Title>
        <Descriptions size="small" column={1} items={fields} />
      </section>
    </div>
    <div className="dossier-summary">{entries.map(item => <Button key={item.key} className="dossier-summary-link"
      onClick={() => patch(item.key === 'purchases' ? { card: item.key, scope: null, stage: null } : { card: item.key })}>
      <b>{item.title} ›</b><span>{item.value}</span>
    </Button>)}</div>
  </>;
}

function PackagingImages({ overview }: Pick<ProductDetailInput, 'overview'>) {
  const visible = overview.images.filter((image) => !image.hidden);
  return <section aria-label="包装图片">
        <Typography.Title level={2}>包装图片</Typography.Title>
        <div className="dossier-gallery">
          {(['inner', 'outer'] as const).map(slot => {
            const label = imageSlotLabel(slot);
            const pictures = visible.filter(image => image.slot === slot);
            const emptyText = overview.images.some(image => image.slot === slot && image.hidden) ? '暂无可见图片' : '原档未附图';
            return <figure key={slot}>
              <figcaption>{label}</figcaption>
              {pictures.length === 0 ? <span className="dossier-note">{emptyText}</span> : pictures.map(image =>
                <Image key={image.id} src={`/files/${image.fileId}`} alt={`${overview.product.skuName.value ?? '产品'} · ${label}`}
                  width="100%" styles={{ image: { objectFit: 'contain' } }} />)}
            </figure>;
          })}
        </div>
      </section>;
}

export function productHeading(overview: ProductOverview | null): string {
  return overview === null ? '产品详情' : overview.product.skuName.value ?? '品名待补充';
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
  const selection = useProductPurchaseSelection();
  const options = Object.entries(props.purchases.byStage).map(([value, count]) => ({
    value, label: `${lineStageText(value)} ${count} 行`,
  }));
  const stage = options.find(option => option.value === props.stage)?.value ?? '';
  const rows = props.purchases.rows.filter(({ orderLine }) => !stage || orderLine.stage === stage);
  const selected = rows.find(({ orderLine }) => orderLine.id === selection.lineId);
  return <div id="purchases" style={{ width: '100%' }}>
    <Flex align="center" wrap gap={space[2]}>
      <Select aria-label="采购阶段" value={stage} virtual={false} style={{ width: 152, maxWidth: '100%' }}
        popupMatchSelectWidth={200} onChange={value => props.patch({ stage: value || null })}
        options={[{ value: '', label: '全部阶段' }, ...options]} />
      <span role="status">采购 {rows.length} 行</span>
    </Flex>
    <Table<ProductPurchases['rows'][number]> size="small" rowKey={row => row.orderLine.id}
      className="dossier-result" pagination={false} dataSource={rows} tableLayout="fixed"
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="此范围没有采购记录。">
        {stage ? <Button onClick={() => props.patch({ stage: null })}>查看全部阶段</Button> : null}
      </Empty> }}
      columns={[
        { title: '采购单 / 商品条码', key: 'order', render: (_, row) => <div>
          <ProductPurchaseTrigger row={row} onOpen={selection.select} />
          {row.orderLine.nameRaw && <div className="dossier-note dossier-purchase-name">{row.orderLine.nameRaw}</div>}
          <div className="dossier-note">{row.orderLine.barcodeRaw}</div>
          {props.purchases.scope === 'all_channels' && <span className="dossier-note">{channelMatchLabel(row.channelMatch)}</span>}
        </div> },
        { title: '品名', key: 'sku', responsive: ['sm'], render: (_, { orderLine }) => orderLine.nameRaw ?? '—' },
        { title: '采购阶段', key: 'stage', width: 100, render: (_, { orderLine }) => <StatusTag status={orderLine.stage} /> },
      ]} />
    {selected === undefined ? null : <ProductPurchaseDrawer key={selected.orderLine.id} row={selected} onClose={() => selection.select(null)} />}
  </div>;
}

function missingStockReason(summary: ProductOverview['cards']['stock']) {
  if (summary.kind !== 'missing') return '暂时没有可回查的库存来源行。';
  return summary.nextStep === 'review_code_links' ? '本条码尚无已审核的库存编码关联。' : '本条码已有编码关联，当前生效的工厂表没有对应库存行。';
}

function MissingFactoryStock({ overview, patch }: Pick<ProductDetailInput, 'overview' | 'patch'>) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'manual'>('idle');
  const canReview = useCan('master.review');
  const canReadImports = useCan('imports.read');
  const summary = overview.cards.stock;
  const isMissingLink = summary.kind === 'missing' && summary.nextStep === 'review_code_links';
  const reason = missingStockReason(summary);
  const handoff = [overview.product.skuName.value, overview.product.barcodeRaw, reason].filter(Boolean).join(' · ');
  const copyForReview = async () => {
    try {
      await navigator.clipboard.writeText(handoff);
      setCopy('copied');
    } catch {
      setCopy('manual');
    }
  };
  return <Alert type="info" showIcon title="代工厂表无对应记录。" description={<>
      <div>{reason}</div>
      <Flex wrap gap={12} align="center" style={{marginTop:8}}>
        <Button onClick={() => patch({ card: 'purchases', scope: 'exact', stage: null })}>查看本条码采购</Button>
        {isMissingLink && !canReview && <Button type="link" onClick={copyForReview}>复制给审核人核对</Button>}
        {isMissingLink && canReview ? <ProductDrillLink to="/master?tab=factory-link&scope=active" tabLabel="库存">查看当前工厂关联诊断</ProductDrillLink> : null}
        {!isMissingLink && canReadImports ? <ProductDrillLink to="/imports?template=factory-progress-v1&status=committed" tabLabel="库存">查看导入记录</ProductDrillLink> : null}
      </Flex>
      {copy === 'copied' ? <span role="status">已复制品名、条码和缺失原因。</span> : null}
      {copy === 'manual' ? <div role="status">请选中并复制：<span style={{userSelect:'all'}}>{handoff}</span></div> : null}
    </>} />;
}

function StockPanel({ overview, stock, patch }: Pick<ProductDetailInput,'overview' | 'patch'> & { stock: ProductStock }) {
  const rows = stock.factory.rows;
  const canReadImports = useCan('imports.read');
  return <section id="stock">
    <Typography.Title level={2}>代工厂库存</Typography.Title>
    {rows.length === 0 ? <MissingFactoryStock overview={overview} patch={patch} /> : <>
      <p className="dossier-note">共 {rows.length} 行来源记录 · 数量单位未提供</p>
      {rows.map(row => <article className="dossier-stock-record" key={row.id}>
        <h3>{row.payload.nameRaw.value ?? row.payload.itemCodeRaw.value ?? '工厂库存行'}</h3>
        <dl className="dossier-identity">
          <div><dt>库存数量</dt><dd>{formatQuantity(row.payload.qtyOnHand.value)}</dd></div>
          <div><dt>物料编码</dt><dd>{row.payload.itemCodeRaw.value ?? '—'}</dd></div>
          <div><dt>批号</dt><dd>{row.payload.lotRaw.value ?? '—'}</dd></div>
        </dl>
        <p>来源 {row.sheetName} · 第 {row.rowNo} 行</p>
        {canReadImports && <ProductDrillLink to={`/imports/${encodeURIComponent(row.importBatchId)}`} sourceLink={`stock:${row.id}`} tabLabel="库存">查看导入批次</ProductDrillLink>}
      </article>)}
    </>}
    <p className="dossier-note">自有仓库存：暂无数据来源。</p>
  </section>;
}

type MaterialPart = Extract<ProductMaterials, { readonly parts: unknown }>['parts'][number];

function MaterialsPanel({ productId, materials }: { readonly productId: string; readonly materials: ProductMaterials }) {
  const canMaintain = useCan('products.maintain');
  const [changed, setChanged] = useState<ReadonlyMap<string, string | null>>(() => new Map());
  const [editing, setEditing] = useState<MaterialPart | null>(null);
  const [isSaving, setSaving] = useState(false);
  if (!('parts' in materials)) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本条码暂无 BOM。" />;
  const rows = materials.parts.map((part, index) => ({
    ...part,
    ownerName: changed.has(part.partCodeRaw) ? changed.get(part.partCodeRaw) ?? null : part.ownerName ?? null,
    index,
  }));
  return <>
    <Typography.Title level={2}>组成物料 · {materials.parts.length} 行子件</Typography.Title>
    <p className="dossier-note">按本条码的 BOM 核对子件。齐套情况需另查物料记录。</p>
    <Table size="small" pagination={false} dataSource={rows} rowKey="index" tableLayout="fixed" columns={[
      { title: '子件名称', key: 'partName', render: (_, part) => <>
        <span>{part.partName}</span>
        <div className="dossier-note dossier-material-code">{part.partCodeRaw}</div>
      </> },
      { title: '子件编码', dataIndex: 'partCodeRaw', responsive: ['sm'] },
      { title: '子件负责人', key: 'ownerName', render: (_, part) => <Flex align="center" wrap gap={space[1]}>
        <span>{part.ownerName ?? '未指定'}</span>
        {canMaintain && (part.partCodeRaw === '' ? <span className="dossier-note">补齐子件编码后可指定</span> : <Button type="link" className="dossier-assign-owner"
          aria-label={`${part.ownerName === null ? '指定' : '修改'}子件负责人 ${part.partCodeRaw}`}
          onClick={() => setEditing(part)}>{part.ownerName === null ? '指定' : '修改'}</Button>)}
      </Flex> },
    ]} />
    <Modal open={editing !== null} title="编辑子件负责人" footer={null}
      closable={{ disabled: isSaving }} keyboard={!isSaving} mask={{ closable: !isSaving }}
      onCancel={() => { if (!isSaving) setEditing(null); }}>
      {editing !== null && <>
        <p className="dossier-note">{editing.partName} · {editing.partCodeRaw}</p>
        <OwnerNameForm productId={productId} partCodeRaw={editing.partCodeRaw} ownerName={editing.ownerName ?? null}
          isSaving={isSaving} onSavingChange={setSaving} onSave={(ownerName) => {
          setChanged((previous) => new Map(previous).set(editing.partCodeRaw, ownerName));
        }} />
      </>}
    </Modal>
  </>;
}
