import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import {
  ProductListSchema,
  ProductMaterialsSchema,
  ProductOverviewSchema,
  ProductPurchasesSchema,
  ProductStockSchema,
  type ProductList,
  type ProductMaterials,
  type ProductOverview,
  type ProductPurchases,
  type ProductStock,
} from '@sw/contracts';
import { Button, Empty, Result, Segmented, Skeleton, Typography } from 'antd';
import { apiGet } from '../../shared/api/client.js';
import { useActorRoles } from '../../shared/actor.js';
import { canMaintain, groupByFiling } from '../../features/product-archive/index.js';
import { PageHeader, surfaceStyle, WorkbenchPage } from '../../shared/ui/page.js';
import type { UiNotice } from '../../shared/ui/notice.js';
import { space, topBar } from '../../theme/tokens.js';
import { ProductDetailBody, productHeading, type ProductCardLoad } from './ProductDetailBody.js';
import { ProductCards, productViewOf } from './product-cards.js';
import { ProductEditDrawer } from './ProductEditDrawer.js';
import { ProductTable } from './product-table.js';
import { readProductEdit, writeProductEdit } from './product-edit-url.js';

const detailCard = { ...surfaceStyle(), padding: space[3] };

type ProductListLoad =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly value: ProductList }
  | { readonly kind: 'error'; readonly message: string };

export function ProductListPage() {
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState<ProductListLoad>({ kind: 'loading' });
  const view = productViewOf(params);
  const load = () => {
    setState({ kind: 'loading' });
    void apiGet('/api/v1/products', ProductListSchema)
      .then((value) => setState({ kind: 'ready', value }))
      .catch(() => setState({ kind: 'error', message: '产品列表没有读出来。' }));
  };
  useEffect(() => { load(); }, []);
  return <ProductCatalog state={state} onRetry={load} view={view} setParams={setParams} />;
}

function ProductCatalog(props: { readonly state: ProductListLoad; readonly onRetry: () => void; readonly view: 'table' | 'card'; readonly setParams: (params: Record<string, string>) => void }) {
  if (props.state.kind === 'loading') return <WorkbenchPage title="产品档案"><Skeleton active paragraph={{ rows: 6 }} /></WorkbenchPage>;
  if (props.state.kind === 'error') return <WorkbenchPage title="产品档案"><Result status="error" title="产品列表没有读出来。" subTitle={props.state.message} extra={<Button type="primary" onClick={props.onRetry}>重试</Button>} /></WorkbenchPage>;
  const list = props.state.value;
  const items = list.items;
  const groups = groupByFiling(filingSeeds(list));
  return (
    <WorkbenchPage title="产品档案">
      {items.length === 0 ? (
        <Empty description="还没有产品档案。下一步：去导入产品档案。">
          <Button href="/imports">去导入</Button>
        </Empty>
      ) : null}
      <Segmented
        value={props.view}
        options={[{ label: '卡片', value: 'card' }, { label: '表格', value: 'table' }]}
        onChange={(value) => props.setParams({ view: viewOf(value) })}
      />
      <FilingHeadings list={list} groups={groups} />
      {props.view === 'table' ? <ProductTable items={items} /> : <ProductCards items={items} />}
    </WorkbenchPage>
  );
}

function viewOf(value: string | number): 'table' | 'card' {
  return value === 'table' ? 'table' : 'card';
}

function filingSeeds(list: ProductList | null) {
  return (list?.groups ?? []).map((group) => ({ id: group.spuKey ?? group.filingName ?? '未备案', filingName: group.filingName }));
}

function FilingHeadings(props: { readonly list: ProductList | null; readonly groups: readonly { readonly filingName: string | null }[] }) {
  return (
    <>
      {props.groups.map((group) => {
        const count = filingCount(props.list, group.filingName);
        return <Typography.Title level={2} key={group.filingName}>{group.filingName}{count === undefined ? '' : ` · ${count}`}</Typography.Title>;
      })}
    </>
  );
}

function filingCount(list: ProductList | null, filingName: string | null): number | undefined {
  return (list?.groups ?? []).find((item) => (item.filingName ?? '未备案') === filingName)?.count;
}

// eslint-disable-next-line max-lines-per-function
export function ProductDetailPage() {
  const params = useParams();
  const [search, setParams] = useSearchParams();
  const [overview, setOverview] = useState<ProductOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [purchases, setPurchases] = useState<ProductPurchases | null>(null);
  const [stock, setStock] = useState<ProductStock | null>(null);
  const [materials, setMaterials] = useState<ProductMaterials | null>(null);
  const [cardLoad, setCardLoad] = useState<ProductCardLoad>({ kind: 'idle' });
  const roles = useActorRoles();
  const [imageIndex, setImageIndex] = useState<number | null>(null);
  const [isEdited, setEdited] = useState(false);
  const [message, setMessage] = useState<UiNotice | null>(null);
  const id = params.id ?? '';
  const card = search.get('card');
  const scope = search.get('scope') === 'exact' ? 'exact' : 'all_channels';
  const stage = search.get('stage');
  useEffect(() => {
    if (id === '') return;
    setOverviewError(null);
    void apiGet(`/api/v1/products/${encodeURIComponent(id)}`, ProductOverviewSchema)
      .then(setOverview)
      .catch(() => { setOverview(null); setOverviewError('产品详情没有读出来。'); });
  }, [id]);
  useEffect(() => {
    if (id === '' || card === null) return;
    let isActive = true;
    setCardLoad({ kind: 'loading' });
    void loadCard({ id, card, scope, setPurchases, setStock, setMaterials })
      .then(() => { if (isActive) setCardLoad({ kind: 'ready' }); })
      .catch(() => { if (isActive) setCardLoad({ kind: 'error', message: '该区块没有读出来。' }); });
    const target = document.getElementById(card);
    if (target !== null) {
      target.style.scrollMarginTop = `${topBar}px`;
      target.scrollIntoView();
    }
    return () => { isActive = false; };
  }, [id, card, scope]);
  return (
    <section style={{ maxWidth: 1440 }}>
      <PageHeader title={productHeading(overview)} action={overview !== null && canMaintain(roles) ? <Button onClick={() => setParams(writeProductEdit({ search: search.toString(), isOpen: true }))}>编辑</Button> : null} />
      {overviewError !== null ? <Result status="error" title="产品详情没有读出来。" subTitle={overviewError} extra={<Button type="primary" onClick={() => {
        setOverviewError(null);
        void apiGet(`/api/v1/products/${encodeURIComponent(id)}`, ProductOverviewSchema)
          .then(setOverview)
          .catch(() => setOverviewError('产品详情没有读出来。'));
      }}>重试</Button>} /> : <div style={detailCard}>
        <ProductDetailBody overview={overview} purchases={purchases} stock={stock} materials={materials} imageIndex={imageIndex} setImageIndex={setImageIndex} card={card} cardLoad={cardLoad} onRetryCard={() => {
          if (id === '' || card === null) return;
          setCardLoad({ kind: 'loading' });
          void loadCard({ id, card, scope, setPurchases, setStock, setMaterials })
            .then(() => setCardLoad({ kind: 'ready' }))
            .catch(() => setCardLoad({ kind: 'error', message: '该区块没有读出来。' }));
        }} scope={scope} stage={stage} setParams={setParams} />
      </div>}
      {overview !== null && canMaintain(roles) ? <ProductEditDrawer id={id} overview={overview} edited={isEdited} setEdited={setEdited} setOverview={setOverview} setMessage={setMessage} isOpen={readProductEdit(search.toString())} message={message} onClose={() => setParams(writeProductEdit({ search: search.toString(), isOpen: false }))} /> : null}
    </section>
  );
}

async function loadCard(input: { readonly id: string; readonly card: string; readonly scope: string; readonly setPurchases: (value: ProductPurchases) => void; readonly setStock: (value: ProductStock) => void; readonly setMaterials: (value: ProductMaterials) => void }) {
  if (input.card === 'purchases') input.setPurchases(await apiGet(`/api/v1/products/${encodeURIComponent(input.id)}/purchases?scope=${encodeURIComponent(input.scope)}`, ProductPurchasesSchema));
  if (input.card === 'stock') input.setStock(await apiGet(`/api/v1/products/${encodeURIComponent(input.id)}/stock`, ProductStockSchema));
  if (input.card === 'materials') input.setMaterials(await apiGet(`/api/v1/products/${encodeURIComponent(input.id)}/materials`, ProductMaterialsSchema));
}
