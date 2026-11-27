import { procurementCutoff } from '../../apps/web/src/features/shell/model/freshness.js';
import { NAV_ROUTES } from '../../apps/web/src/app/page-manifest.js';
import { describe, expect, it } from 'vitest';
import { roleLabel, type Role } from '../../packages/domain/src/index.js';
import {
  shellView,
  todayScope,
  type BadgeMark,
  type NavPath,
  type QueueFacts,
  type ShellView,
  type TodayFacts,
} from '../../apps/web/src/features/shell/index.js';

const HIDDEN = ['/home', '/master', '/settings', '/dashboard', '/reports'];
const NAV_LABELS = '首页,今日事项,计划与新品,跟进中心,管理看板,产品档案,导入与审核';

function counts(values: readonly [number, number, number, number]): QueueFacts {
  const [aliases, codes, links, multiName] = values;
  return { kind: 'known', aliases, codes, links, multiName };
}

function viewOf(input: {
  readonly name?: string;
  readonly roles: readonly Role[];
  readonly queue: QueueFacts;
  readonly today?: TodayFacts;
}): ShellView {
  return shellView({
    user: { name: input.name ?? '用户', roles: input.roles },
    queue: input.queue,
    today: input.today ?? { kind: 'pending' },
    procurementDate: null,
    navRoutes: NAV_ROUTES,
  });
}

function home(roles: readonly Role[], queue: QueueFacts): ShellView {
  return viewOf({ roles, queue });
}

function badgeAt(view: ShellView, path: NavPath): BadgeMark {
  const row = view.nav.find((item) => item.to === path);
  if (row === undefined) throw new Error(`缺少导航 ${path}`);
  return row.badge;
}

function todayBadge(today: TodayFacts): BadgeMark {
  return badgeAt(viewOf({ roles: ['buyer'], queue: { kind: 'unknown' }, today }), '/today');
}

describe('首页和主数据角标', () => {
  it('审核人只靠多品名也能进主数据，角标是合计', () => {
    const view = home(['reviewer'], counts([0, 0, 0, 2]));
    expect(view.home).toBe('/master');
    expect(badgeAt(view, '/imports')).toEqual({ kind: 'count', value: 2 });
  });

  it('四个计数相加', () => {
    const view = home(['reviewer'], counts([1, 2, 3, 4]));
    expect(badgeAt(view, '/imports')).toEqual({ kind: 'count', value: 10 });
  });

  it('只有审核人且合计为 0 时回进度，不显示角标', () => {
    const view = home(['reviewer'], counts([0, 0, 0, 0]));
    expect(view.home).toBe('/progress');
    expect(badgeAt(view, '/imports')).toEqual({ kind: 'none' });
  });

  it('只有审核人且队列未知时回进度，角标是缺失', () => {
    const view = home(['reviewer'], { kind: 'unknown' });
    expect(view.home).toBe('/progress');
    expect(badgeAt(view, '/imports')).toEqual({ kind: 'missing' });
  });

  it('审核人兼管理层在未知和空队列时都进首页', () => {
    const unknown = home(['reviewer', 'manager'], { kind: 'unknown' });
    const empty = home(['reviewer', 'manager'], counts([0, 0, 0, 0]));
    expect(unknown.home).toBe('/home');
    expect(badgeAt(unknown, '/imports')).toEqual({ kind: 'missing' });
    expect(empty.home).toBe('/home');
    expect(badgeAt(empty, '/imports')).toEqual({ kind: 'none' });
  });

  it('审核人兼负责人在有待审时进主数据', () => {
    expect(home(['reviewer', 'lead'], counts([1, 0, 0, 0])).home).toBe('/master');
  });

  it('只有管理员时进设置，主数据行没有数字', () => {
    const view = home(['admin'], counts([3, 0, 0, 0]));
    expect(view.home).toBe('/settings');
    expect(view.nav.find((item) => item.to === '/imports')?.matchPaths).toEqual(['/imports', '/imports/:id', '/master']);
    expect(badgeAt(view, '/imports')).toEqual({ kind: 'none' });
    expect(view.nav.map((item) => item.label).join(',')).toBe(NAV_LABELS);
  });

  it('只有管理员且队列未完成时首页未定，主数据角标仍是 none', () => {
    const view = home(['admin'], { kind: 'pending' });
    expect(view.home).toBeUndefined();
    expect(badgeAt(view, '/imports')).toEqual({ kind: 'none' });
  });

  it('管理员兼采购落在进度', () => {
    expect(home(['admin', 'buyer'], counts([4, 0, 0, 0])).home).toBe('/progress');
  });

  it('管理员兼审核人在有待审时进主数据并显示合计', () => {
    const view = home(['admin', 'reviewer'], counts([1, 1, 0, 0]));
    expect(view.home).toBe('/master');
    expect(badgeAt(view, '/imports')).toEqual({ kind: 'count', value: 2 });
  });

  it('单采购进今日，空角色留在进度，日常入口权限各自保留', () => {
    const cases = [
      { roles: ['buyer'], route: '/today' },
      { roles: [], route: '/progress' },
    ] satisfies readonly { readonly roles: readonly Role[]; readonly route: string }[];
    for (const { roles, route } of cases) {
      const view = home(roles, { kind: 'unknown' });
      const paths = view.nav.map((item) => item.to);
      expect(view.home).toBe(route);
      expect(paths.some((path) => HIDDEN.includes(path))).toBe(false);
      const imports = view.nav.find((item) => item.to === '/imports');
      expect(imports?.label).toBe(roles.length === 0 ? undefined : '导入中心');
      expect(paths).toHaveLength(roles.length === 0 ? 4 : 5);
    }
  });

  it('采购兼审核人按原队列和角色优先级选择首页', () => {
    expect(home(['buyer', 'reviewer'], counts([1, 0, 0, 0])).home).toBe('/master');
    expect(home(['buyer', 'reviewer'], counts([0, 0, 0, 0])).home).toBe('/progress');
    expect(home(['buyer', 'manager'], counts([0, 0, 0, 0])).home).toBe('/home');
  });

  it('负责人进周报，侧栏共用管理看板入口', () => {
    const view = home(['lead'], { kind: 'unknown' });
    expect(view.home).toBe('/reports');
    expect(view.nav.map((item) => item.label)).toContain('管理看板');
    expect(view.nav.map((item) => item.label)).not.toContain('周报');
    expect(view.nav.map((item) => item.to)).not.toContain('/imports');
  });

  it('管理层兼负责人进首页', () => {
    expect(home(['manager', 'lead'], { kind: 'unknown' }).home).toBe('/home');
  });

  it('审核人在队列未完成时首页未定，角标保持 pending', () => {
    const view = home(['reviewer'], { kind: 'pending' });
    expect(view.home).toBeUndefined();
    expect(badgeAt(view, '/imports')).toEqual({ kind: 'pending' });
  });
});

describe('今日角标和范围', () => {
  it('严重度不低于 2 的个数不看顺序', () => {
    const first = todayBadge({ kind: 'complete', severities: [1, 3, 2] });
    const second = todayBadge({ kind: 'complete', severities: [2, 3, 1] });
    expect(first).toEqual({ kind: 'count', value: 2 });
    expect(second).toEqual(first);
  });

  it('没有紧急项时不显示角标', () => {
    expect(todayBadge({ kind: 'complete', severities: [1] })).toEqual({ kind: 'none' });
    expect(todayBadge({ kind: 'complete', severities: [] })).toEqual({ kind: 'none' });
  });

  it('失败和截断是缺失，未完成是 pending', () => {
    expect(todayBadge({ kind: 'failed' })).toEqual({ kind: 'missing' });
    expect(todayBadge({ kind: 'truncated' })).toEqual({ kind: 'missing' });
    expect(todayBadge({ kind: 'pending' })).toEqual({ kind: 'pending' });
  });

  it('管理层、负责人和管理员看全部，其余看自己的', () => {
    const rows: readonly (readonly [readonly Role[], 'mine' | 'all'])[] = [
      [['manager'], 'all'],
      [['lead'], 'all'],
      [['admin'], 'all'],
      [['buyer', 'manager'], 'all'],
      [['buyer'], 'mine'],
      [['reviewer'], 'mine'],
      [['reviewer', 'buyer'], 'mine'],
      [[], 'mine'],
    ];
    for (const [roles, scope] of rows) expect(todayScope({ roles })).toBe(scope);
  });
});

it('上传日期按业务时区跨日，缺上传日期时不显示截止日期', () => {
  expect(procurementCutoff('2026-11-24T16:00:00.000Z', 'Asia/Shanghai')).toBe('2026-11-25');
  expect(procurementCutoff('2026-11-24T15:59:59.999Z', 'Asia/Shanghai')).toBe('2026-11-24');
  expect(procurementCutoff(undefined)).toBeNull();
  expect(procurementCutoff('not-a-time')).toBeNull();
});

describe('用户菜单', () => {
  it('管理员兼任其他角色时仍可从账户菜单进入系统设置', () => {
    const entries = viewOf({
      name: '管理员',
      roles: ['admin', 'reviewer'],
      queue: { kind: 'pending' },
    }).account.entries;
    expect(entries.map((entry) => entry.kind)).toEqual(['name', 'role', 'role', 'settings', 'logout']);
    expect(entries.map((entry) => entry.label)).toEqual([
      '管理员',
      roleLabel('admin'),
      roleLabel('reviewer'),
      '系统设置',
      '退出',
    ]);
  });
});
