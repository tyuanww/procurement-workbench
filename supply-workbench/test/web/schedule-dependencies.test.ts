// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { ProgressSchedule } from '../../apps/web/src/pages/progress/progress-schedule.js';
import { ActorRoles } from '../../apps/web/src/shared/actor.js';
import { emptyReads } from '../../apps/web/src/shared/api/reads.js';
import { act, calls, click, element, fulfill, installFetch, memoryRouter, mount, resetDom, textOf, waitFor } from './party-preview-dom.js';

const id = 'procurement-schedule:production:line-1';
const predecessor = { id: 'procurement-schedule:materials:line-1', title: '齐料', plannedEnd: '2026-11-08', status: 'blocked' };
const production = {
  id, title: '生产', status: 'in_progress', subjectType: 'order_line', subjectId: 'line-1', kind: 'task',
  ownerUserId: null, ownerName: null, counterpartyPartyId: null, counterpartyRole: null, counterpartyName: null,
  plannedStart: '2026-11-09', plannedEnd: '2026-11-10', priority: 'normal', source: 'manual',
  parentId: null, version: 1, overdueDays: null, orderLine: null, batch: null,
  supplierPartyId: null, supplierName: null, factoryPartyId: null, factoryName: null,
};

let mounted: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  await act(() => mounted?.unmount());
  mounted = undefined;
  emptyReads();
  resetDom();
});

it.each(['desktop', 'phone'])('总排期 %s 展示依赖冲突并打开正确的采购里程碑', async (viewport) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: viewport === 'phone' ? query.includes('max-width') : query.includes('min-width'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  installFetch();
  const schedule = element(ProgressSchedule, { store: 'all', filters: null });
  mounted = mount(memoryRouter(element(ActorRoles, { roles: ['buyer'], children: schedule }), '/progress?view=schedule&from=2026-11-09'));
  await waitFor(() => calls.some((call) => call.url === '/api/v1/plan/schedule?from=2026-11-09&to=2026-11-15&includeClosed=true&includeDelivery=true'));
  await act(async () => { fulfill({ urlPart: '/api/v1/plan/schedule?', status: 200, body: {
    from: '2026-11-09', to: '2026-11-15', total: 1, items: [production],
    dependencyConflicts: { [id]: [predecessor] },
  } }); });

  const warning = '依赖冲突 · 齐料（计划完成 2026-11-08）仍阻塞';
  expect(textOf('body')).toContain(warning);
  const taskButton = viewport === 'desktop'
    ? document.querySelector('button[aria-label="生产 进行中"]')
    : [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes(warning));
  if (!(taskButton instanceof HTMLButtonElement)) throw new Error('没有找到生产按钮');
  if (viewport === 'desktop') {
    expect(document.getElementById(taskButton.getAttribute('aria-describedby') ?? '')?.textContent).toBe(warning);
  }
  click(taskButton);
  await waitFor(() => calls.some((call) => call.url.endsWith(`/plan/work-items/${encodeURIComponent(id)}`)));
});
