import type { Settings } from '@sw/domain';
import type { AuditEntryView, FeishuPublishResult, UserView, WeeklyReport, WeeklyReportData, WeeklyReportListItem } from '@sw/application';
import { z } from 'zod';
import { RoleSchema } from './enums.js';
import { FreshnessSourceSchema } from './import-views.js';
import { ManagementMeetingSnapshotSchema } from './management-meeting.js';
import { nullable, optional, strictObject } from './shape.js';
import { UserRef } from './refs.js';
import { EntityIdSchema, LocalDateSchema } from './values.js';
import { BuyerLoadRowSchema, StuckDistributionSchema, SupplierEventsSchema, SupplierKpiRowSchema } from './dashboard-views.js';

const weekDelta = <T extends z.ZodType>(value: T) => strictObject({
  value,
  previous: nullable(value),
});

export const WeeklyReportDataSchema: z.ZodType<WeeklyReportData> = strictObject({
  overview: strictObject({
    dueBatches: weekDelta(z.number()),
    onTime: weekDelta(strictObject({ rate: nullable(z.number()), n: z.number() })),
    overdue: weekDelta(z.number()),
    exceptionsOpened: z.number(),
    exceptionsClosed: z.number(),
    missingDateRate: nullable(z.number()),
  }),
  risks: z.array(strictObject({
    batchId: z.string(),
    orderLineId: z.string(),
    overdueDays: nullable(z.number()),
    nameRaw: nullable(z.string()),
  })),
  stuck: StuckDistributionSchema,
  suppliers: z.array(SupplierKpiRowSchema),
  supplierUnassigned: optional(SupplierEventsSchema),
  buyers: z.array(BuyerLoadRowSchema),
  exceptions: strictObject({ opened: z.number(), closed: z.number() }),
  dueNextWeek: z.array(strictObject({
    batchId: z.string(),
    dueDate: LocalDateSchema,
    nameRaw: nullable(z.string()),
  })),
  managementMeeting: optional(z.array(ManagementMeetingSnapshotSchema)),
  notes: strictObject({
    sources: z.array(FreshnessSourceSchema),
    basedOnWorkbenchRecords: z.literal(true),
  }),
});

export const WeeklyReportSchema: z.ZodType<WeeklyReport> = strictObject({
  id: z.string(),
  weekStart: LocalDateSchema,
  weekEnd: LocalDateSchema,
  generatedAt: z.string(),
  generatedBy: UserRef,
  supersededBy: nullable(z.string()),
  dataWatermark: z.array(FreshnessSourceSchema),
  data: WeeklyReportDataSchema,
});

export const WeeklyReportDetailSchema = WeeklyReportSchema.and(strictObject({ feishuConfigured: z.boolean() }));
export type WeeklyReportDetail = z.output<typeof WeeklyReportDetailSchema>;

export const FeishuPublishResultSchema: z.ZodType<FeishuPublishResult> = strictObject({ docUrl: z.string().min(1) });

export const WeeklyReportListItemSchema: z.ZodType<WeeklyReportListItem> = strictObject({
  id: z.string(),
  weekStart: LocalDateSchema,
  weekEnd: LocalDateSchema,
  generatedAt: z.string(),
  generatedBy: UserRef,
  supersededBy: nullable(z.string()),
  exports: z.array(strictObject({
    format: z.enum(['xlsx', 'pdf', 'png', 'feishu']),
    fileId: nullable(z.string()),
    docUrl: nullable(z.string()),
  })),
});

export const UserViewSchema: z.ZodType<UserView> = strictObject({
  id: z.string(),
  name: z.string(),
  roles: z.array(RoleSchema),
  active: z.boolean(),
  feishuOpenId: nullable(z.string()),
});

export const AuditEntryViewSchema: z.ZodType<AuditEntryView> = strictObject({
  id: z.string(),
  actorUserId: z.string(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string(),
  before: z.unknown(),
  after: z.unknown(),
  at: z.string(),
});

export const SettingsSchema: z.ZodType<Settings> = strictObject({
  upcomingDays: z.number(),
  shippedNotReceivedAlertDays: nullable(z.number()),
  deliveryNoteAlertDays: nullable(z.number()),
  missingDateHintWindowDays: z.number(),
  dateSanityRange: strictObject({ from: LocalDateSchema, to: LocalDateSchema }),
  ownWarehousePartyId: nullable(EntityIdSchema),
});

export type { AuditEntryView, FeishuPublishResult, Settings, UserView, WeeklyReport, WeeklyReportData, WeeklyReportListItem };
