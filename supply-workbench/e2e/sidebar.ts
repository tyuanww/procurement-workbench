import type { Locator } from '../node_modules/.pnpm/node_modules/playwright/index.js';

export function sidebarGroup(sidebar: Locator, name: string): Locator {
  return sidebar.getByRole('menuitem', { name, exact: true }).and(sidebar.locator('[aria-expanded]'));
}

export async function sidebarLink(sidebar: Locator, group: string, name: string): Promise<Locator> {
  const trigger = sidebarGroup(sidebar, group);
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  return sidebar.getByRole('link', { name, exact: true });
}

export function sidebarEntries(sidebar: Locator): Locator {
  return sidebar.locator('ul.ant-menu-root > li');
}
