import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import {
  ProductListSchema,
  ProductOverviewSchema,
  type ProductList,
  type ProductOverview,
} from '@sw/contracts';
import { Button, Empty, Flex, Form, Input, Pagination, Result, Skeleton, Typography } from 'antd';
import { apiGetWithSignal } from '../../shared/api/client.js';
import { useActorRoles, useCan } from '../../shared/actor.js';
import { canMaintain } from '../../features/product-archive/index.js';
import { writeUrlState } from '../../shared/hooks/url-state.js';
import { PageHeader, surfaceStyle, WorkbenchPage } from '../../shared/ui/page.js';
import { ViewSwitch } from '../../shared/ui/view-switch.js';
import type { UiNotice } from '../../shared/ui/notice.js';
import { space, topBar } from '../../theme/tokens.js';
import { ProductDetailBody, productHeading } from './ProductDetailBody.js';
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
  const results = useRef<HTMLElement>(null);
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
      <div style={{ ...surfaceStyle(), padding: space[2], marginBottom: space[3] }}>
        <ProductSearch query={query} onSearch={searchFor} />
      </div>
      <section ref={results} tabIndex={-1} aria-label="产品查询结果" style={{ scrollMarginTop: topBar + space[2] }}>
        <ProductCatalog key={JSON.stringify([query, page])} query={query} page={page} view={view}
          onClear={() => searchFor('')} onView={(value) => update({ view: value })} onPage={changePage} />
      </section>
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
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (props.query !== '') params.set('q', props.query);
    if (props.page > 1) params.set('page', String(props.page));
    const path = params.size === 0 ? '/api/v1/products' : `/api/v1/products?${params}`;
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
      {view === 'table' ? <ProductTable items={items} exactBarcode={query} /> : <ProductCards items={items} exactBarcode={query} />}
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
  const locationState: unknown = useLocation().state;
  const [search, setSearch] = useSearchParams();
  const setParams = (next: Parameters<typeof setSearch>[0]) => setSearch(next, { state: locationState });
  const [overview, setOverview] = useState<ProductOverview | null>(null);
  const [hasOverviewError, setOverviewError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const roles = useActorRoles();
  const [isEdited, setEdited] = useState(false);
  const [message, setMessage] = useState<UiNotice | null>(null);
  const setEdit = (isOpen: boolean) => setParams(writeProductEdit({ search: search.toString(), isOpen }));
  const canEdit = overview !== null && canMaintain(roles);
  useEffect(() => {
    const controller = new AbortController();
    void apiGetWithSignal({ path: `/api/v1/products/${encodeURIComponent(id)}`, schema: ProductOverviewSchema, signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setOverview(value); })
      .catch(() => { if (!controller.signal.aborted) setOverviewError(true); });
    return () => controller.abort();
  }, [id, attempt]);
  return (
    <section style={{ maxWidth: 1440 }}>
      <Typography.Paragraph><Link to={{ pathname: '/products', search: catalogSearchOf(locationState) }}>返回产品档案</Link></Typography.Paragraph>
      <PageHeader title={productHeading(overview)} showIdentity action={canEdit ? <Button onClick={() => setEdit(true)}>编辑</Button> : null} />
      {hasOverviewError ? <Result status="error" title="产品详情没有读出来。" extra={<Button type="primary" onClick={() => {
        setOverviewError(false);
        setAttempt((value) => value + 1);
      }}>重试</Button>} /> : <div style={detailCard}>
        {overview === null ? <Skeleton active paragraph={{ rows: 4 }} /> : (
          <ProductDetailBody id={id} overview={overview} search={search} patch={(patch) => setParams(writeUrlState(search.toString(), patch))} />
        )}
      </div>}
      {canEdit ? <ProductEditDrawer id={id} overview={overview} edited={isEdited} setEdited={setEdited} setOverview={setOverview} setMessage={setMessage} isOpen={readProductEdit(search.toString())} message={message} onClose={() => setEdit(false)} /> : null}
    </section>
  );
}

function catalogSearchOf(state: unknown): string {
  if (state === null || typeof state !== 'object' || !('catalogSearch' in state)) return '';
  return typeof state.catalogSearch === 'string' ? state.catalogSearch : '';
}
