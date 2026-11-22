// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { entityId } from '../../packages/domain/src/values/ids.js';
import { readDesk } from '../../apps/web/src/features/follow-up/index.js';
import { LineTable } from '../../apps/web/src/pages/lines/list/LineListPage.js';
import { PartyPreviewDrawer } from '../../apps/web/src/pages/lines/list/PartyPreviewDrawer.js';
import { renderLineCell } from '../../apps/web/src/pages/lines/list/line-cell.js';
import { closePartyPreview, openPartyPreview, readPartyPreview, type OpenParty } from '../../apps/web/src/pages/lines/list/party-preview.js';
import { partyBody, sampleRow } from './party-preview-fixture.js';
import {
  act,
  button,
  calls,
  click,
  element,
  fulfill,
  installFetch,
  installMatchMedia,
  memoryRouter,
  mount,
  rejectFetch,
  resetDom,
  settle,
  textOf,
  useHostSearch,
  useHostState,
  waitFor,
} from './party-preview-dom.js';

afterEach(resetDom);

describe('跟进台主体预览交互', () => {
  it('三个入口打开对应记录，未关联没有按钮，关闭后筛选选中和滚动还在', async () => {
    installMatchMedia();
    installFetch();
    const view = mount(element(DeskHarness));
    const scroller = document.querySelector('#scroller');
    if (!(scroller instanceof HTMLElement)) throw new Error('没有滚动容器');
    scroller.scrollTop = 180;
    click(button('供应商预览'));
    await settle();
    expect(textOf('#search')).toContain('partyId=party-supplier');
    expect(textOf('#search')).toContain('lane=finished');
    expect(textOf('#search')).toContain('page=2');
    expect(textOf('#picked')).toBe('line-1');
    fulfill({ urlPart: 'party-supplier', status: 200, body: partyBody('party-supplier', '甲代工厂供应链') });
    await waitFor(() => document.body.textContent?.includes('甲代工厂供应链') === true);
    expect(document.body.textContent).toContain('甲代工厂原料');
    expect(document.body.textContent).toContain('应到 4');
    expect(document.querySelector('a[href="/parties/party-supplier"]')?.textContent).toBe('打开主体详情');
    expect(document.body.textContent).not.toContain('保存');
    expect(document.body.textContent).not.toContain('审批');
    click(button('关闭'));
    await settle();
    const closed = new URLSearchParams(textOf('#search'));
    expect(closed.get('lane')).toBe('finished');
    expect(closed.get('page')).toBe('2');
    expect(closed.get('q')).toBe('面膜');
    expect(closed.get('drawer')).toBeNull();
    expect(textOf('#picked')).toBe('line-1');
    expect(scroller.scrollTop).toBe(180);
    expect(document.body.textContent).not.toContain('甲代工厂供应链');
    click(button('工厂预览'));
    fulfill({ urlPart: 'party-factory', status: 200, body: partyBody('party-factory', '代工甲') });
    await waitFor(() => document.body.textContent?.includes('代工甲') === true);
    expect(document.querySelector('a[href="/parties/party-factory"]')).not.toBeNull();
    view.unmount();
    const material = mount(element(MaterialCell));
    click(button('收货代工厂预览'));
    await settle();
    expect(textOf('#receiver')).toBe('party-receiver');
    expect(document.querySelector('[aria-label="工厂预览"]')).toBeNull();
    material.unmount();
  });

  it('无权限、找不到和失败可以重试，快速切换不会留下上一条', async () => {
    installFetch();
    const view = mount(element(SwitchHarness));
    click(button('打开甲'));
    click(button('打开乙'));
    await settle();
    const stale = calls.find((call) => call.url.includes('party-a') && call.signal?.aborted === true);
    expect(stale).toBeDefined();
    stale?.resolve(new Response(JSON.stringify(partyBody('party-a', '甲厂')), { status: 200, headers: { 'content-type': 'application/json' } }));
    fulfill({ urlPart: 'party-b', status: 200, body: partyBody('party-b', '乙厂') });
    await waitFor(() => document.body.textContent?.includes('乙厂') === true);
    expect(document.body.textContent).not.toContain('甲厂');
    click(button('关闭'));
    await settle();
    click(button('打开甲'));
    fulfill({ urlPart: 'party-a', status: 403, body: { error: { code: 'FORBIDDEN' } } });
    await waitFor(() => document.body.textContent?.includes('没有权限看这个主体') === true);
    expect(document.body.textContent).toContain('角色不允许');
    click(button('重试'));
    fulfill({ urlPart: 'party-a', status: 404, body: { error: { code: 'NOT_FOUND' } } });
    await waitFor(() => document.body.textContent?.includes('找不到这个主体') === true);
    click(button('重试'));
    fulfill({ urlPart: 'party-a', status: 500, body: { error: { code: 'INTERNAL' } } });
    await waitFor(() => document.body.textContent?.includes('主体没有读出来') === true);
    click(button('重试'));
    rejectFetch({ urlPart: 'party-a', error: new Error('offline') });
    await waitFor(() => document.body.textContent?.includes('网络没有连上') === true);
    click(button('关闭'));
    click(button('打开甲'));
    await settle();
    expect(document.body.textContent).not.toContain('甲厂');
    expect(document.body.textContent).not.toContain('没有权限看这个主体');
    view.unmount();
  });

  it('Esc 关闭抽屉，焦点回到打开它的按钮', async () => {
    installMatchMedia();
    installFetch();
    const view = mount(element(DeskHarness));
    const opener = button('供应商预览');
    opener.focus();
    click(opener);
    fulfill({ urlPart: 'party-supplier', status: 200, body: partyBody('party-supplier', '甲代工厂供应链') });
    await waitFor(() => document.body.textContent?.includes('甲代工厂供应链') === true);
    await waitFor(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement) === true);
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await waitFor(() => document.querySelector('[role="dialog"]') === null && document.activeElement === opener);
    expect(textOf('#search')).not.toContain('drawer=party');
    view.unmount();
  });

  it('直接渲染的单元格把主体 id 交给打开函数', () => {
    const opened: OpenParty[] = [];
    const linked = sampleRow({ supplier: { id: 'party-supplier', displayName: '甲代工厂', rawName: null } });
    const html = mount(renderLineCell({
      column: 'supplier',
      row: linked,
      now: new Date('2026-11-17T00:00:00Z'),
      onOpenParty: (next) => { opened.push(next); },
    }));
    click(button('供应商预览'));
    expect(opened).toEqual([{ partyId: 'party-supplier', role: 'supplier' }]);
    html.unmount();
    const bare = sampleRow({ supplier: { id: null, displayName: null, rawName: '原始厂' } });
    const plain = mount(renderLineCell({ column: 'supplier', row: bare, now: new Date('2026-11-17T00:00:00Z'), onOpenParty: () => undefined }));
    expect(document.querySelector('[aria-label="供应商预览"]')).toBeNull();
    expect(document.body.textContent).toContain('原始厂');
    plain.unmount();
  });
});

function DeskHarness() {
  return memoryRouter(element(DeskScreen));
}

function DeskScreen() {
  const [params, setParams] = useHostSearch();
  const [picked, setPicked] = useHostState<readonly string[]>(['line-1']);
  const search = params.toString();
  const desk = readDesk(search);
  const party = readPartyPreview(search);
  const row = sampleRow({
    lane: 'finished',
    supplier: { id: 'party-supplier', displayName: '甲代工厂', rawName: null },
    factory: { id: 'party-factory', displayName: '代工甲' },
    receiver: null,
  });
  return element('div', { children: [
    element('div', { id: 'search', children: search }),
    element('div', { id: 'picked', children: picked.join(',') }),
    element('div', { id: 'scroller', style: { height: 80, overflow: 'auto' }, children: element('div', { style: { height: 400 }, children: element(LineTable, {
      columns: desk.columns,
      rows: [row],
      picked,
      setPicked,
      page: desk.page,
      pageSize: desk.pageSize,
      total: 1,
      search,
      setParams,
      isUpdating: false,
      density: 'small',
      hiddenKeys: [],
      now: new Date('2026-11-17T00:00:00Z'),
      onOpenParty: (opened: OpenParty) => { setParams(openPartyPreview({ search, opened }), { preventScrollReset: true }); },
    }) }) }),
    party === null ? null : element(PartyPreviewDrawer, {
      opened: party.opened,
      onClose: () => { setParams(closePartyPreview(search), { preventScrollReset: true }); },
    }),
  ] });
}

function MaterialCell() {
  const [id, setId] = useHostState('');
  const row = sampleRow({
    lane: 'material',
    supplier: { id: null, displayName: null, rawName: '原料商' },
    factory: null,
    receiver: { id: 'party-receiver', displayName: '收货厂' },
  });
  return element('div', { children: [
    element('div', { id: 'receiver', children: id }),
    renderLineCell({ column: 'receiver', row, now: new Date('2026-11-17T00:00:00Z'), onOpenParty: (opened) => { setId(opened.partyId); } }),
    renderLineCell({ column: 'factory', row, now: new Date('2026-11-17T00:00:00Z'), onOpenParty: () => { setId('opened-factory'); } }),
  ] });
}

function SwitchHarness() {
  const [opened, setOpened] = useHostState<OpenParty | null>(null);
  return element('div', { children: [
    element('button', { type: 'button', onClick: () => { setOpened({ partyId: entityId('party-a'), role: 'supplier' }); }, children: '打开甲' }),
    element('button', { type: 'button', onClick: () => { setOpened({ partyId: entityId('party-b'), role: 'factory' }); }, children: '打开乙' }),
    element('button', { type: 'button', onClick: () => { setOpened(null); }, children: '关闭' }),
    opened === null ? null : element(PartyPreviewDrawer, { key: `${opened.role}:${opened.partyId}`, opened, onClose: () => { setOpened(null); } }),
  ] });
}
