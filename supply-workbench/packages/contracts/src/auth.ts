import type { EntityId, Role } from '@sw/domain';
import { z } from 'zod';
import { RoleSchema } from './enums.js';
import { strictObject } from './shape.js';
import { EntityIdSchema, LocalDateSchema } from './values.js';

export const HealthResponseSchema = strictObject({
  ok: z.boolean(),
  db: z.enum(['up', 'down']),
  migration: z.string(),
});
export type HealthResponse = z.output<typeof HealthResponseSchema>;

/** 05 没列字段。开发登录目录返回的就是这个用户。 */
export const SessionUserSchema = strictObject({
  id: EntityIdSchema,
  name: z.string(),
  roles: z.array(RoleSchema),
});
export type SessionUser = { readonly id: EntityId; readonly name: string; readonly roles: readonly Role[] };

export const DevUserOptionSchema = SessionUserSchema;
export type DevUserOption = SessionUser;

export const MeResponseSchema = strictObject({
  id: EntityIdSchema,
  name: z.string(),
  roles: z.array(RoleSchema),
  devLogin: z.boolean(),
});
export type MeResponse = { readonly id: EntityId; readonly name: string; readonly roles: readonly Role[]; readonly devLogin: boolean };

export const SessionMetaSchema = strictObject({
  businessTimeZone: z.string().min(1),
  businessDate: LocalDateSchema,
});
export type SessionMeta = z.output<typeof SessionMetaSchema>;

export const AuthModeSchema = strictObject({ mode: z.enum(['dev', 'feishu']) });
export type AuthMode = z.output<typeof AuthModeSchema>;

export const DevLoginRequestSchema = strictObject({
  userId: z.string(),
  accessCode: z.string(),
});
export type DevLoginRequest = z.output<typeof DevLoginRequestSchema>;
