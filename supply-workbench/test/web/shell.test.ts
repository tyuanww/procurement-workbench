import { NAV_ROUTES } from '../../apps/web/src/app/page-manifest.js';
import { describe, expect, it } from 'vitest';
import { roleLabel, type Role } from '../../packages/domain/src/index.js';
import {
  shellView,
  todayScope,
  type BadgeMark,
  type FreshnessChip,
  type FreshnessFacts,
  type NavPath,
  type QueueFacts,
  type ShellView,
  type SourceFact,
  type TodayFacts,
} from '../../apps/web/src/features/shell/index.js';

const NOW = '2026-10-18T00:00:00.000Z';
const HIDDEN = ['/master', '/settings', '/dashboard', '/reports'];
const NAV_LABELS = '管理店铺,今日,跟进台,管理看板,产品档案,导入与审核,设置';

function counts(values: readonly [number, number, number, number]): QueueFacts {
  const [aliases, codes, links, multiName] = values;
  return { kind: 'known', aliases, codes, links, multiName };
}

function viewOf(input: {
  readonly name?: string;
  readonly roles: readonly Role[];
  readonly queue: QueueFacts;
  readonly today?: TodayFacts;
  readonly freshness?: FreshnessFacts;
}): ShellView {
  return shellView({
    user: { name: input.name ?? '用户', roles: input.roles },
    queue: input.queue,
    today: input.today ?? { kind: 'pending' },
    freshness: input.freshness ?? { kind: 'pending' },
    now: NOW,
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

function plant(times: readonly [string | null, string | null, string | null]): SourceFact {
  const [lastCommittedAt, fileModifiedAt, factoryPartyId] = times;
  return {
    template: 'factory-progress-v1',
    label: '代工厂进度',
    lastCommittedAt,
    fileModifiedAt,
    factoryPartyId,
  };
}

function master(times: readonly [string | null, string | null]): SourceFact {
  const [lastCommittedAt, fileModifiedAt] = times;
  return {
    template: 'po-master-v1',
    label: '采购订单总表',
    lastCommittedAt,
    fileModifiedAt,
    factoryPartyId: null,
  };
}

function shown(facts: FreshnessFacts): ShellView['freshness'] {
  return viewOf({ roles: ['buyer'], queue: { kind: 'unknown' }, freshness: facts }).freshness;
}

function ready(sources: readonly SourceFact[]): FreshnessFacts {
  return { kind: 'ready', sources };
}

function onlyChip(facts: FreshnessFacts): FreshnessChip {
  const chip = shown(facts).chips[0];
  if (chip === undefined) throw new Error('没有新鲜度');
  return chip;
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

  it('审核人兼管理层在未知和空队列时都进看板', () => {
    const unknown = home(['reviewer', 'manager'], { kind: 'unknown' });
    const empty = home(['reviewer', 'manager'], counts([0, 0, 0, 0]));
    expect(unknown.home).toBe('/dashboard');
    expect(badgeAt(unknown, '/imports')).toEqual({ kind: 'missing' });
    expect(empty.home).toBe('/dashboard');
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
    expect(home(['buyer', 'manager'], counts([0, 0, 0, 0])).home).toBe('/dashboard');
  });

  it('负责人进周报，侧栏共用管理看板入口', () => {
    const view = home(['lead'], { kind: 'unknown' });
    expect(view.home).toBe('/reports');
    expect(view.nav.map((item) => item.label)).toContain('管理看板');
    expect(view.nav.map((item) => item.label)).not.toContain('周报');
    expect(view.nav.map((item) => item.to)).not.toContain('/imports');
  });

  it('管理层兼负责人进看板', () => {
    expect(home(['manager', 'lead'], { kind: 'unknown' }).home).toBe('/dashboard');
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

describe('新鲜度', () => {
  it('刚好 7 天不警告，再早 1 毫秒警告', () => {
    const onTime = shown(ready([plant(['2026-10-11T00:00:00.000Z', '2026-10-11T00:00:00.000Z', null])]));
    const late = shown(ready([plant(['2026-10-10T23:59:59.999Z', '2026-10-11T00:00:00.000Z', null])]));
    expect(onTime.chips[0]?.isStale).toBe(false);
    expect(late.chips[0]?.isStale).toBe(true);
  });

  it('提交时间为空或无法解析时显示破折号且不警告', () => {
    const missing = shown(ready([master([null, null])]));
    const broken = shown(ready([master(['not-a-time', null])]));
    expect(missing.chips[0]?.text).toBe('采购订单总表 —');
    expect(missing.chips[0]?.isStale).toBe(false);
    expect(missing.chips[0]?.status).toBe('unknown');
    expect(broken.chips[0]?.text).toBe('采购订单总表 —');
    expect(broken.chips[0]?.isStale).toBe(false);
    expect(broken.chips[0]?.status).toBe('unknown');
  });

  it('代工厂同时显示导入时刻和文件时间', () => {
    const view = shown(ready([plant(['2026-10-11T06:02:00.000Z', null, 'party-a'])]));
    expect(view.chips[0]?.text).toBe('代工厂进度 10-11 14:02 文件时间 —');
    expect(view.chips[0]?.text).not.toContain('party-a');
  });

  it('提交时间或文件时间过旧都会警告，缺文件时间为未知', () => {
    const stale = shown(
      ready([plant(['2026-10-10T00:00:00.000Z', '2026-10-17T06:02:00.000Z', null])]),
    );
    const staleFile = shown(ready([plant(['2026-10-12T00:00:00.000Z', '2026-01-01T00:00:00.000Z', null])]));
    const unknownFile = shown(ready([plant(['2026-10-12T00:00:00.000Z', null, null])]));
    expect(stale.chips[0]?.isStale).toBe(true);
    expect(stale.chips[0]?.text).toBe('代工厂进度 10-10 08:00 文件时间 10-17 14:02');
    expect(staleFile.chips[0]?.isStale).toBe(true);
    expect(staleFile.chips[0]?.status).toBe('stale');
    expect(staleFile.chips[0]?.text).toBe('代工厂进度 10-12 08:00 文件时间 01-01 08:00');
    expect(unknownFile.chips[0]?.status).toBe('unknown');
  });

  it('总表忽略文件时间', () => {
    const view = shown(ready([master(['2026-10-11T06:02:00.000Z', '2026-01-01T00:00:00.000Z'])]));
    expect(view.chips[0]?.text).toBe('采购订单总表 10-11 14:02');
    expect(view.chips[0]?.text).not.toContain('文件时间');
  });

  it('同年芯片不写年，提示始终带年，跨年才写在芯片上', () => {
    const same = onlyChip(ready([master(['2026-10-11T06:02:00.000Z', null])]));
    const prior = onlyChip(ready([master(['2025-10-11T06:02:00.000Z', null])]));
    const turned = onlyChip(ready([master(['2025-12-31T16:00:00.000Z', null])]));
    const still = onlyChip(ready([master(['2025-12-31T15:59:00.000Z', null])]));
    const plantRow = onlyChip(ready([plant(['2026-10-11T06:02:00.000Z', '2025-01-01T00:00:00.000Z', null])]));
    expect(same.text).toBe('采购订单总表 10-11 14:02');
    expect(same.tooltip).toBe('采购订单总表 2026-10-11 14:02');
    expect(prior.text).toBe('采购订单总表 2025-10-11 14:02');
    expect(prior.tooltip).toBe(prior.text);
    expect(turned.text).toBe('采购订单总表 01-01 00:00');
    expect(turned.tooltip).toBe('采购订单总表 2026-01-01 00:00');
    expect(still.text).toBe('采购订单总表 2025-12-31 23:59');
    expect(still.tooltip).toBe(still.text);
    expect(plantRow.text).toBe('代工厂进度 10-11 14:02 文件时间 2025-01-01 08:00');
    expect(plantRow.tooltip).toBe('代工厂进度 2026-10-11 14:02 文件时间 2025-01-01 08:00');
    const lines = [same, prior, turned, still, plantRow].flatMap((chip) => [chip.text, chip.tooltip]);
    expect(lines.join(' ')).not.toContain('星期');
  });

  it('没有来源和失败都是缺失，加载中只写数据', () => {
    const empty = shown(ready([]));
    const failed = shown({ kind: 'failed' });
    const pending = shown({ kind: 'pending' });
    expect(empty).toEqual({ headline: '数据：—', chips: [] });
    expect(empty.headline).not.toContain('总表');
    expect(failed).toEqual({ headline: '数据：—', chips: [] });
    expect(pending).toEqual({ headline: '数据', chips: [] });
  });

  it('同一标签的两家工厂用不同的 key，正文不写 id', () => {
    const view = shown(
      ready([
        plant(['2026-10-11T06:02:00.000Z', null, 'party-a']),
        plant(['2026-10-11T06:02:00.000Z', null, 'party-b']),
      ]),
    );
    expect(view.chips[0]?.key).not.toBe(view.chips[1]?.key);
    expect(view.chips[0]?.text).not.toContain('party-a');
    expect(view.chips[1]?.text).not.toContain('party-b');
  });
});

describe('用户菜单', () => {
  it('姓名、每个角色和退出，没有别的种类', () => {
    const entries = viewOf({
      name: '管理员',
      roles: ['admin', 'reviewer'],
      queue: { kind: 'pending' },
    }).account.entries;
    expect(entries.map((entry) => entry.kind)).toEqual(['name', 'role', 'role', 'logout']);
    expect(entries.map((entry) => entry.label)).toEqual([
      '管理员',
      roleLabel('admin'),
      roleLabel('reviewer'),
      '退出',
    ]);
  });
});
