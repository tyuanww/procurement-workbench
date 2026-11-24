import { useEffect, useId, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
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
import { Button, Empty, Flex, Form, Input, Result, Segmented, Skeleton, Typography } from 'antd';
import { apiGet, apiGetWithSignal } from '../../shared/api/client.js';
import { useActorRoles, useCan } from '../../shared/actor.js';
import { canMaintain } from '../../features/product-archive/index.js';
import { writeUrlState } from '../../shared/hooks/url-state.js';
import { PageHeader, surfaceStyle, WorkbenchPage } from '../../shared/ui/page.js';
import type { UiNotice } from '../../shared/ui/notice.js';
import { space, topBar } from '../../theme/tokens.js';
import { ProductDetailBody, productHeading, type ProductCardLoad } from './ProductDetailBody.js';
import { ProductCards, productViewOf, type ProductView } from './product-cards.js';
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
  const query = params.get('q')?.trim() ?? '';
  const view = productViewOf(params);
  const update = (patch: Record<string, string | null>) => setParams(writeUrlState(params.toString(), patch));
  return (
    <WorkbenchPage title="产品档案">
      <Flex align="end" justify="space-between" wrap gap={space[2]} style={{ marginBottom: space[3] }}>
        <ProductSearch query={query} onSearch={(value) => update({ q: value.trim() })} />
        <Segmented<ProductView>
          aria-label="产品档案显示方式"
          value={view}
          options={[{ label: '卡片', value: 'card' }, { label: '表格', value: 'table' }]}
          onChange={(value) => update({ view: value })}
        />
      </Flex>
      <ProductCatalog key={query} query={query} view={view} onClear={() => update({ q: null })} />
    </WorkbenchPage>
  );
}

function ProductSearch({ query, onSearch }: { readonly query: string; readonly onSearch: (value: string) => void }) {
  const id = useId();
  const [value, setValue] = useState(query);
  useEffect(() => { setValue(query); }, [query]);
  return (
    <search aria-label="产品档案查询" style={{ width: '100%', maxWidth: 360 }}>
      <Form.Item label="品名或条码" htmlFor={id} colon={false} style={{ margin: 0 }}>
        <Input.Search id={id} enterButton={<Button type="primary" autoInsertSpace={false}>搜索</Button>} allowClear value={value}
          onChange={(event) => setValue(event.target.value)} onSearch={onSearch} />
      </Form.Item>
    </search>
  );
}

function ProductCatalog(props: { readonly query: string; readonly view: ProductView; readonly onClear: () => void }) {
  const [state, setState] = useState<ProductListLoad>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const path = props.query === '' ? '/api/v1/products' : `/api/v1/products?${new URLSearchParams({ q: props.query })}`;
    void apiGetWithSignal({ path, schema: ProductListSchema, signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setState({ kind: 'ready', value }); })
      .catch(() => { if (!controller.signal.aborted) setState({ kind: 'error', message: '产品列表没有读出来。' }); });
    return () => controller.abort();
  }, [props.query, attempt]);
  const retry = () => {
    setState({ kind: 'loading' });
    setAttempt((current) => current + 1);
  };
  if (state.kind === 'loading') return <Skeleton active paragraph={{ rows: 6 }} />;
  if (state.kind === 'error') return <Result status="error" title={state.message} extra={<Button type="primary" onClick={retry}>重试</Button>} />;
  return <ProductCatalogResults {...props} list={state.value} />;
}

function ProductCatalogResults({ query, view, onClear, list }: { readonly query: string; readonly view: ProductView; readonly onClear: () => void; readonly list: ProductList }) {
  const canReadImports = useCan('imports.read');
  const items = list.items;
  const isSearching = query !== '';
  if (items.length === 0) return (
    <Empty description={isSearching ? '没有符合条件的产品。' : '还没有产品档案。'}>
      {isSearching ? <Button onClick={onClear}>清除搜索</Button> : null}
      {!isSearching && canReadImports ? <Button href="/imports">去导入</Button> : null}
    </Empty>
  );
  return (
    <>
      <Typography.Paragraph type="secondary">共 {list.page.total} 款产品{items.length < list.page.total ? `，显示前 ${items.length} 款` : ''}</Typography.Paragraph>
      {view === 'table' ? <ProductTable items={items} /> : <ProductCards items={items} />}
    </>
  );
}

// eslint-disable-next-line max-lines-per-function
export function ProductDetailPage() {
  const params = useParams();
  const locationState: unknown = useLocation().state;
  const [search, setSearch] = useSearchParams();
  const setParams = (next: Parameters<typeof setSearch>[0]) => setSearch(next, { state: locationState });
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
      <Typography.Paragraph><Link to={{ pathname: '/products', search: catalogSearchOf(locationState) }}>返回产品档案</Link></Typography.Paragraph>
      <PageHeader title={productHeading(overview)} showIdentity action={overview !== null && canMaintain(roles) ? <Button onClick={() => setParams(writeProductEdit({ search: search.toString(), isOpen: true }))}>编辑</Button> : null} />
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

function catalogSearchOf(state: unknown): string {
  if (state === null || typeof state !== 'object' || !('catalogSearch' in state)) return '';
  return typeof state.catalogSearch === 'string' ? state.catalogSearch : '';
}

async function loadCard(input: { readonly id: string; readonly card: string; readonly scope: string; readonly setPurchases: (value: ProductPurchases) => void; readonly setStock: (value: ProductStock) => void; readonly setMaterials: (value: ProductMaterials) => void }) {
  if (input.card === 'purchases') input.setPurchases(await apiGet(`/api/v1/products/${encodeURIComponent(input.id)}/purchases?scope=${encodeURIComponent(input.scope)}`, ProductPurchasesSchema));
  if (input.card === 'stock') input.setStock(await apiGet(`/api/v1/products/${encodeURIComponent(input.id)}/stock`, ProductStockSchema));
  if (input.card === 'materials') input.setMaterials(await apiGet(`/api/v1/products/${encodeURIComponent(input.id)}/materials`, ProductMaterialsSchema));
}
