import { createRequire } from 'node:module';
import { MasterPage } from '../../apps/web/src/pages/master/MasterPage.js';
import { ReviewQueueProvider } from '../../apps/web/src/features/shell/index.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));

export function renderMasterRoute(pathname: string): string {
  const react = requireWeb('react');
  const server = requireWeb('react-dom/server');
  const router = requireWeb('react-router');
  const page = react.createElement(ReviewQueueProvider, { refresh: async () => undefined, children: react.createElement(MasterPage, null) });
  const html = server.renderToStaticMarkup(react.createElement(router.MemoryRouter, { initialEntries: [pathname], children: page }));
  if (typeof html !== 'string') throw new Error('没有渲染成字符串');
  return html;
}
