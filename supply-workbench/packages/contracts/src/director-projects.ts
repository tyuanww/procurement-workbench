import { z } from 'zod';
import { strictObject } from './shape.js';

export const SCHEDULE_MILESTONES = [
  '配方确认时间', '稳定性结束时间', '兼容性结束时间', '设计方案确认时间', '中式原料到货时间', '中试时间',
  '功效测试结束时间', '备案提交时间', '备案下证时间', 'BOM表搭建情况', '大货稿件情况', '成本核算情况', '通知下单时间',
] as const;

export const DirectorProjectSchema = strictObject({
  row: z.int().positive(), brand: z.string(), name: z.string(), contact: z.string(), notes: z.string(),
  arrival: z.string(), milestones: z.record(z.enum(SCHEDULE_MILESTONES), z.string()),
});
export type DirectorProject = z.output<typeof DirectorProjectSchema>;
export const DirectorScheduleSchema = strictObject({
  brands: z.array(z.string()), projects: z.array(DirectorProjectSchema),
});
export const DirectorBrandsSchema = z.array(strictObject({ lineId: z.string(), brand: z.string().nullable() }));
