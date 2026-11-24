// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { useDeskLoad } from '../../apps/web/src/pages/lines/list/use-desk-load.js';
import { act, button, calls, click, element, fulfill, installFetch, mount, resetDom, settle, textOf, useHostState, waitFor } from './party-preview-dom.js';
import { sampleRow } from './party-preview-fixture.js';

afterEach(resetDom);

it('筛选发起新请求时清空旧结果，迟到的订单列表不会覆盖新筛选', async () => {
  installFetch();
  const view = mount(element(DeskRequest));
  try {
    fulfill({ urlPart: 'q=first', status: 200, body: pageWith('先前订单') });
    await waitFor(() => textOf('output') === '先前订单');

    click(button('切换筛选'));
    expect(textOf('output')).toBe('pending');
    const earlier = calls.find((call) => call.url.includes('q=second'));
    if (earlier === undefined) throw new Error('没有第二次筛选请求');

    click(button('切换筛选'));
    expect(earlier.signal?.aborted).toBe(true);
    fulfill({ urlPart: 'q=third', status: 200, body: pageWith('当前订单') });
    await waitFor(() => textOf('output') === '当前订单');

    earlier.resolve(new Response(JSON.stringify(pageWith('迟到的订单')), { status: 200 }));
    await settle();
    expect(textOf('output')).toBe('当前订单');
  } finally {
    act(() => view.unmount());
  }
});

function DeskRequest() {
  const [query, setQuery] = useHostState('first');
  const result = useDeskLoad({ query: `q=${query}`, reload: 0 });
  return element('div', {
    children: [
      element('button', { key: 'change', children: '切换筛选', onClick: () => setQuery(query === 'first' ? 'second' : 'third') }),
      element('output', { key: 'result', children: result.kind === 'ready' ? result.rows[0]?.nameRaw : result.kind }),
    ],
  });
}

function pageWith(nameRaw: string) {
  return { items: [{ ...sampleRow({}), nameRaw }], page: { page: 1, pageSize: 50, total: 1 } };
}
