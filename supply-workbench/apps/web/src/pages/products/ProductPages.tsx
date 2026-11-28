import { UploadOutlined } from '@ant-design/icons';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import {
  ProductListSchema,
  ProductOverviewSchema,
  type ProductList,
  type ProductOverview,
} from '@sw/contracts';
import { Button, Card, Empty, Flex, Form, Input, Pagination, Result, Skeleton, Typography } from 'antd';
import { apiGetWithSignal } from '../../shared/api/client.js';
import { useCan } from '../../shared/actor.js';
import { detailReturnState, useDetailReturnFocus } from '../../shared/hooks/detail-return-focus.js';
import { writeUrlState } from '../../shared/hooks/url-state.js';
import { PageHeader, surfaceStyle, WorkbenchPage } from '../../shared/ui/page.js';
import { ViewSwitch } from '../../shared/ui/view-switch.js';
import { space, topBar } from '../../theme/tokens.js';
import { ProductDetailBody, productHeading } from './ProductDetailBody.js';
import { ProductCards, productViewOf, type ProductView } from './product-cards.js';
import { ProductEditDrawer } from './ProductEditDrawer.js';
import { ProductTable } from './product-table.js';
import { readProductEdit, resolveProductDetailDrawers, writeProductEdit, writeWorkbookBatch } from './product-edit-url.js';
import { ProductJourney, productNavigationState } from './product-journey.js';

const detailCard = { ...surfaceStyle(), padding: space[3], minWidth: 0 };

type ProductListLoad =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly value: ProductList }
  | { readonly kind: 'error'; readonly message: string };

export function ProductListPage() {
  const [params, setParams] = useSearchParams();
  const results = useRef<HTMLElement>(null);
  const [revision, setRevision] = useState(0);
  const query = params.get('q')?.trim() ?? '';
  const page = productPageOf(params.get('page'));
  const view = productViewOf(params);
  const update = (patch: Record<string, string | null>) => setParams(writeUrlState(params.toString(), patch));
  const searchFor = (value: string) => update({ q: value.trim(), page: null });
  const changePage = (number: number) => {
    results.current?.focus();
    results.current?.scrollIntoView({ block: 'start' });
    update({ page: number === 1 ? null : String(number) });
  };
  return (
    <WorkbenchPage title="产品档案">
      <Flex wrap align="center" justify="space-between" gap={space[2]} style={{ ...surfaceStyle(), padding: space[3], marginBottom: space[3] }}>
        <ProductSearch query={query} onSearch={searchFor} />
        <CatalogImporter onCommitted={() => setRevision(value => value + 1)} />
      </Flex>
      <section className="dossier-catalog" ref={results} tabIndex={-1} aria-label="产品查询结果" style={{ scrollMarginTop: topBar + space[2] }}>
        <ProductCatalog key={JSON.stringify([query, page, revision])} query={query} page={page} view={view}
          onClear={() => searchFor('')} onView={(value) => update({ view: value })} onPage={changePage} />
      </section>
    </WorkbenchPage>
  );
}

function CatalogImporter({ onCommitted }: { readonly onCommitted: () => void }) {
  const canImport = useCan('imports.write');
  const [search, setSearch] = useSearchParams();
  const setOpen = (isOpen: boolean) => setSearch(writeProductEdit({ search: search.toString(), isOpen }));
  const catalogSearch = writeUrlState(search.toString(), { drawer: null, workbookBatch: null });
  if (!canImport) return null;
  return <>
    <Button type="primary" className="dossier-catalog-import" icon={<UploadOutlined aria-hidden />} onClick={() => setOpen(true)}>新建产品</Button>
    <ProductEditDrawer product={null} isOpen={readProductEdit(search.toString())}
      batchId={search.get('workbookBatch')}
      setBatchId={batchId => setSearch(writeWorkbookBatch({ search: search.toString(), batchId }), { replace: true })}
      onClose={() => setOpen(false)} onCommitted={onCommitted}
      receiptDestination={productId => ({ to: `/products/${encodeURIComponent(productId)}`, state: { catalogSearch } })} />
  </>;
}

function ProductSearch({ query, onSearch }: { readonly query: string; readonly onSearch: (value: string) => void }) {
  const id = useId();
  const [value, setValue] = useState(query);
  useEffect(() => { setValue(query); }, [query]);
  return (
    <search className="dossier-search" aria-label="产品档案查询" style={{ width: '100%', maxWidth: 460 }}>
      <Form.Item label="品名或条码" htmlFor={id} colon={false} style={{ margin: 0 }}>
        <Input.Search placeholder="输入品名、基础条码或完整条码" id={id} enterButton={<Button type="primary" autoInsertSpace={false}>搜索</Button>} allowClear value={value}
          onChange={(event) => setValue(event.target.value)} onSearch={onSearch} />
      </Form.Item>
    </search>
  );
}

type CatalogProps = {
  readonly query: string;
  readonly page: number;
  readonly view: ProductView;
  readonly onClear: () => void;
  readonly onView: (view: ProductView) => void;
  readonly onPage: (page: number) => void;
};

function productPageOf(value: string | null): number {
  if (value === null || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 1;
}

function ProductCatalog(props: CatalogProps) {
  const [state, setState] = useState<ProductListLoad>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useDetailReturnFocus(state.kind === 'ready');
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ cover: 'packaging', owners: '1', filing: '1' });
    if (props.query !== '') params.set('q', props.query);
    if (props.page > 1) params.set('page', String(props.page));
    const path = `/api/v1/products?${params}`;
    void apiGetWithSignal({ path, schema: ProductListSchema, signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setState({ kind: 'ready', value }); })
      .catch(() => { if (!controller.signal.aborted) setState({ kind: 'error', message: '产品列表没有读出来。' }); });
    return () => controller.abort();
  }, [props.query, props.page, attempt]);
  const retry = () => {
    setState({ kind: 'loading' });
    setAttempt((current) => current + 1);
  };
  if (state.kind === 'loading') return <Skeleton active paragraph={{ rows: 6 }} />;
  if (state.kind === 'error') return <Result status="error" title={state.message} extra={<Button type="primary" onClick={retry}>重试</Button>} />;
  return <ProductCatalogResults {...props} list={state.value} />;
}

function ProductCatalogResults({ query, page, view, onClear, onPage, onView, list }: CatalogProps & { readonly list: ProductList }) {
  const { items } = list;
  if (items.length === 0) return <ProductCatalogEmpty query={query} page={page} onClear={onClear} onPage={onPage} />;
  return (
    <Flex vertical gap={space[2]}>
      <Flex align="center" justify="space-between" wrap gap={space[2]}>
        <Typography.Text type="secondary" role="status">
          共 {list.page.total} 款产品{list.page.total > list.page.pageSize ? ` · 第 ${list.page.page} 页` : ''}
        </Typography.Text>
        <ViewSwitch<ProductView> aria-label="产品档案显示方式" value={view}
          options={[{ label: '卡片', value: 'card' }, { label: '表格', value: 'table' }]} onChange={onView} />
      </Flex>
      <div key={view} className="dossier-result-view">
        {view === 'table' ? <Card size="small" className="dossier-table-card">
          <ProductTable items={items} exactBarcode={query} />
        </Card> : <ProductCards items={items} exactBarcode={query} />}
      </div>
      {list.page.total <= list.page.pageSize ? null : <nav aria-label="产品档案分页">
        <Pagination size="small" current={list.page.page} pageSize={list.page.pageSize} total={list.page.total}
          showLessItems showSizeChanger={false} onChange={onPage} />
      </nav>}
    </Flex>
  );
}

function ProductCatalogEmpty({ query, page, onClear, onPage }: Pick<CatalogProps, 'query' | 'page' | 'onClear' | 'onPage'>) {
  const canReadImports = useCan('imports.read');
  if (page > 1) return <Empty description="该页没有产品"><Button onClick={() => onPage(1)}>返回第一页</Button></Empty>;
  if (query !== '') return <Empty description="没有符合条件的产品。"><Button onClick={onClear}>清除搜索</Button></Empty>;
  return <Empty description="还没有产品档案。">{canReadImports ? <Button href="/imports">去导入</Button> : null}</Empty>;
}

export function ProductDetailPage() {
  const { id = '' } = useParams();
  return <ProductDetail key={id} id={id} />;
}

function ProductDetail({ id }: { readonly id: string }) {
  const { pathname, state } = useLocation();
  const locationState = productNavigationState(state);
  const [routeSearch, setSearch] = useSearchParams();
  const canImport = useCan('imports.write');
  const search = resolveProductDetailDrawers(routeSearch, canImport);
  const resolvedSearch = search.toString();
  const shouldReplace = search !== routeSearch;
  useEffect(() => {
    if (shouldReplace) setSearch(resolvedSearch, { state, replace: true, preventScrollReset: true });
  }, [resolvedSearch, setSearch, shouldReplace, state]);
  const setParams = (next: Parameters<typeof setSearch>[0]) => setSearch(next, { state: locationState });
  const detail = useProductDetail(id);
  const { overview, hasOverviewError } = detail;
  const setEdit = (isOpen: boolean) => setParams(writeProductEdit({ search: search.toString(), isOpen }));
  const canEdit = overview !== null && canImport;
  return (
    <section className="dossier-detail" style={detailCard}>
      <ProductCatalogReturn detailPath={pathname} locationState={locationState} />
      <PageHeader title={productHeading(overview)} showIdentity action={canEdit ? <Button type="primary" icon={<UploadOutlined aria-hidden />} onClick={() => setEdit(true)}>
        更新此产品
      </Button> : null} />
      {hasOverviewError ? <Result status="error" title="产品详情没有读出来。" extra={<Button type="primary" onClick={detail.reload}>重试</Button>} /> : overview === null ? <Skeleton active paragraph={{ rows: 4 }} /> : (
        <ProductJourney><ProductDetailBody id={id} overview={overview} search={search} archiveRevision={detail.revision} patch={(patch) => setParams(writeUrlState(search.toString(), patch))} /></ProductJourney>
      )}
      {canEdit ? <ProductEditDrawer product={overview} batchId={search.get('workbookBatch')}
        setBatchId={(batchId) => setSearch(writeWorkbookBatch({ search: search.toString(), batchId }), { state: locationState, replace: true })}
        onCommitted={detail.reload}
        receiptDestination={(productId) => ({
          to: productId === id ? { pathname, search: writeProductEdit({ search: search.toString(), isOpen: false }).toString() } :
            `/products/${encodeURIComponent(productId)}`,
          state: catalogReceiptState(locationState, pathname),
        })}
        isOpen={readProductEdit(search.toString())} onClose={() => setEdit(false)} /> : null}
    </section>
  );
}

function useProductDetail(id: string) {
  const [overview, setOverview] = useState<ProductOverview | null>(null);
  const [hasOverviewError, setOverviewError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void apiGetWithSignal({ path: `/api/v1/products/${encodeURIComponent(id)}?owners=1`, schema: ProductOverviewSchema, signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setOverview(value); })
      .catch(() => { if (!controller.signal.aborted) setOverviewError(true); });
    return () => controller.abort();
  }, [id, revision]);
  return {
    overview, hasOverviewError, revision,
    reload() { setOverviewError(false); setRevision(value => value + 1); },
  };
}

function ProductCatalogReturn({ detailPath, locationState }: { readonly detailPath: string; readonly locationState: unknown }) {
  const search = catalogSearchOf(locationState);
  return <Typography.Paragraph><Link to={{ pathname: '/products', search }}
    state={detailReturnState(locationState, catalogOriginPathOf(locationState) ?? detailPath)}>返回产品档案</Link></Typography.Paragraph>;
}

function catalogReceiptState(state: unknown, pathname: string): unknown {
  if (state === null || typeof state !== 'object') return state;
  return { ...state, catalogOriginPath: catalogOriginPathOf(state) ?? pathname };
}

function catalogOriginPathOf(state: unknown): string | null {
  if (state === null || typeof state !== 'object' || !('catalogOriginPath' in state)) return null;
  return typeof state.catalogOriginPath === 'string' ? state.catalogOriginPath : null;
}

function catalogSearchOf(state: unknown): string {
  if (state === null || typeof state !== 'object' || !('catalogSearch' in state)) return '';
  return typeof state.catalogSearch === 'string' ? state.catalogSearch : '';
}
