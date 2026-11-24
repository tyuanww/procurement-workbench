import type { NavDestination, NavPath } from '../shared/page-manifest.js';

export const destinations: Partial<Record<NavPath, readonly NavDestination[]>> = {
  '/progress': [
    { to: '/progress/current', label: '当前进度', aliases: ['/progress'] },
    { to: '/progress/schedule', label: '总排期', aliases: ['/progress?view=schedule'] },
    { to: '/progress/development', label: '新品开发进度', aliases: ['/progress?view=development'] },
  ],
  '/today': [
    { to: '/today', label: '行动板' },
    { to: '/today?group=schedule', label: '今日排期', aliases: ['/today?group=owner', '/today?group=supplier'] },
  ],
  '/dashboard': [
    { to: '/dashboard', label: '卡点' },
    { to: '/dashboard?view=suppliers', label: '供应商表现' },
    { to: '/dashboard?view=buyers', label: '采购负荷' },
    { to: '/dashboard?view=project', label: '项目进度' },
    { to: '/dashboard?view=meeting', label: '管理周会' },
    { to: '/reports', label: '周报（待开发）' },
  ],
  '/imports': [
    { to: '/imports', label: '导入中心' },
    { to: '/master', label: '别名审核', gate: 'review' },
    { to: '/master?tab=multi', label: '一号多名', gate: 'review' },
    { to: '/master?tab=owner-map', label: '负责人映射', gate: 'review' },
    { to: '/master?tab=factory-link', label: '工厂待处理', gate: 'review', aliases: ['/master?tab=unlinked'] },
    { to: '/master?tab=factory-link&scope=active', label: '当前关联诊断', gate: 'review' },
    { to: '/master?tab=factory-link&scope=historical', label: '历史关联诊断', gate: 'review' },
  ],
};
