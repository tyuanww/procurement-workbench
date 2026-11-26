// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import type { OrderLineDetail, PartyView } from '../../packages/contracts/src/index.js';
import { LineRecordDrawer } from '../../apps/web/src/pages/lines/detail/RecordSession.js';
import { act, button, click, element, installMatchMedia, memoryRouter, mount, resetDom, waitFor } from './party-preview-dom.js';
import { sampleRow } from './party-preview-fixture.js';

const loc = 'http://localhost';
const preset = { id: 'preset-warehouse', displayName: '预置仓（双角色）', isSupplier: false, isFactory: true, isOwnWarehouse: true, note: null };
const LAST_LABEL = '第201家代工厂';
const FIRST_PAGE = 200;
const factory = { ...preset, id: 'factory-last', displayName: LAST_LABEL, isOwnWarehouse: false };

afterEach(resetDom);

it('新增批次可按名称选择下一页工厂，并保留预置仓且主体选项去重', async () => {
  installMatchMedia();
  const requested: string[] = [];
  let savedBody: unknown = null;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), loc);
    if (init?.method === 'POST') {
      savedBody = typeof init.body === 'string' ? JSON.parse(init.body) : null;
      return Response.json({ error: { code: 'VALIDATION_FAILED', message: '测试仅记录提交' } }, { status: 400 });
    }
    requested.push(`${url.pathname}${url.search}`);
    return Response.json(partyPage(url));
  });
  const view = mount(memoryRouter(element(LineRecordDrawer, { detail: detail(), onReload: () => undefined }), '/lines/line-1?drawer=create'));
  try {
    await waitFor(() => requested.includes('/api/v1/parties?role=factory&pageSize=200&page=2'));
    expect(document.body.textContent).toContain(preset.displayName);

    search(preset.displayName);
    await waitFor(() => listOptions(preset.displayName).length > 0);
    expect(listOptions(preset.displayName)).toHaveLength(1);
    search(LAST_LABEL);
    await waitFor(() => listOptions(LAST_LABEL).length > 0);
    const selected = listOptions(LAST_LABEL)[0];
    if (!(selected instanceof HTMLElement)) throw new Error('没有第二页工厂选项');
    click(selected);
    click(button('确认'));
    expect(savedBody).toMatchObject({ receiverPartyId: factory.id, plannedQty: 10 });
  } finally {
    await act(() => view.unmount());
  }
});

function partyPage(url: URL): { items: readonly PartyView[]; page: { page: number; pageSize: number; total: number } } {
  const page = Number(url.searchParams.get('page') ?? 1);
  const pageSize = Number(url.searchParams.get('pageSize'));
  const rows = url.searchParams.get('role') === 'factory'
    ? [preset, ...Array.from({ length: FIRST_PAGE - 1 }, (_, index) => ({ ...factory, id: `factory-${index}`, displayName: `普通工厂 ${index}` })), factory]
    : [preset];
  return { items: rows.slice((page - 1) * pageSize, page * pageSize), page: { page, pageSize, total: rows.length } };
}

function detail(): OrderLineDetail {
  return {
    line: {
      ...sampleRow({ receiver: { id: preset.id, displayName: preset.displayName } }),
      unit: '件',
      purchaseOrderId: 'po-1',
      itemId: null,
      cancelledAt: null,
      cancelReason: null,
    },
    po: { id: 'po-1', poRaw: 'PO-001', poFormat: 'OTHER', relatedPoRaws: [] },
    codes: [],
    snapshot: null,
    batches: [],
    factoryReports: { inTransit: [], shipments: [], stock: [], schedule: [], demand: [], packagingCombo: [] },
    exceptions: [],
    followUps: [],
  };
}

function search(value: string): void {
  const label = [...document.querySelectorAll('label')].find((candidate) => candidate.textContent === '收货方');
  const input = label?.control;
  if (!(input instanceof HTMLInputElement)) throw new Error('没有收货方搜索框');
  act(() => {
    input.focus();
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function listOptions(label: string): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.ant-select-item-option-content')].filter((item) => item.textContent === label);
}
