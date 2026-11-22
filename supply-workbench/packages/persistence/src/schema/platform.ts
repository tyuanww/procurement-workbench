import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { at, id, timestamps } from './columns.js';

function meta() {
  return { id: id(), ...timestamps };
}

export const users = pgTable('users', {
  ...meta(),
  name: text('name').notNull(),
  roles: text('roles').array().notNull(),
  feishuOpenId: text('feishu_open_id'),
  active: boolean('active').notNull(),
});

export const authOauthStates = pgTable(
  'auth_oauth_states',
  {
    id: id(),
    stateHash: text('state_hash').notNull(),
    nonceHash: text('nonce_hash').notNull(),
    redirectUri: text('redirect_uri').notNull(),
    returnTo: text('return_to').notNull(),
    createdAt: at('created_at').notNull(),
    expiresAt: at('expires_at').notNull(),
    usedAt: at('used_at'),
  },
  (table) => [uniqueIndex('auth_oauth_states_state_hash').on(table.stateHash)],
);

export const parties = pgTable('parties', {
  ...meta(),
  displayName: text('display_name').notNull(),
  isSupplier: boolean('is_supplier').notNull(),
  isFactory: boolean('is_factory').notNull(),
  isOwnWarehouse: boolean('is_own_warehouse').notNull(),
  note: text('note'),
});

export const partyAliases = pgTable(
  'party_aliases',
  {
    ...meta(),
    rawName: text('raw_name').notNull(),
    normName: text('norm_name').notNull(),
    partyId: text('party_id'),
    status: text('status').notNull(),
    firstSeenImportBatchId: text('first_seen_import_batch_id'),
    seenCount: integer('seen_count').notNull(),
    seenBatchCount: integer('seen_batch_count').notNull().default(0),
    reviewedBy: text('reviewed_by'),
    reviewedAt: at('reviewed_at'),
  },
  (table) => [uniqueIndex('party_aliases_norm_name').on(table.normName)],
);

export const items = pgTable('items', {
  ...meta(),
  displayName: text('display_name').notNull(),
  kind: text('kind').notNull(),
  spec: text('spec'),
  sharedCodeFlag: boolean('shared_code_flag').notNull(),
});

export const itemCodes = pgTable(
  'item_codes',
  {
    ...meta(),
    codeType: text('code_type').notNull(),
    codeRaw: text('code_raw').notNull(),
    codeNorm: text('code_norm').notNull(),
    itemId: text('item_id'),
    status: text('status').notNull(),
  },
  (table) => [uniqueIndex('item_codes_type_norm').on(table.codeType, table.codeNorm)],
);

export const itemNames = pgTable('item_names', {
  itemId: text('item_id').notNull(),
  nameRaw: text('name_raw').notNull(),
  nameNorm: text('name_norm').notNull(),
  seenCount: integer('seen_count').notNull(),
});

export const nameDecisions = pgTable('name_decisions', {
  itemId: text('item_id').primaryKey(),
  mode: text('mode').notNull(),
});

export const codeLinks = pgTable('code_links', {
  ...meta(),
  fromCodeId: text('from_code_id').notNull(),
  toCodeId: text('to_code_id').notNull(),
  status: text('status').notNull(),
  evidence: jsonb('evidence'),
  reviewedBy: text('reviewed_by'),
  reviewedAt: at('reviewed_at'),
});

export const settings = pgTable('settings', {
  id: text('id').primaryKey(),
  upcomingDays: integer('upcoming_days').notNull(),
  shippedNotReceivedAlertDays: integer('shipped_not_received_alert_days'),
  deliveryNoteAlertDays: integer('delivery_note_alert_days'),
  missingDateHintWindowDays: integer('missing_date_hint_window_days').notNull(),
  dateSanityRange: jsonb('date_sanity_range').notNull(),
  ownWarehousePartyId: text('own_warehouse_party_id'),
});

export const commandIdempotency = pgTable(
  'command_idempotency',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').notNull(),
    route: text('route').notNull(),
    resourceId: text('resource_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    payloadHash: text('payload_hash').notNull(),
    result: jsonb('result'),
    claimedAt: at('claimed_at').notNull(),
    completedAt: at('completed_at'),
  },
  (table) => [uniqueIndex('command_idempotency_scope').on(table.actorId, table.route, table.resourceId, table.idempotencyKey)],
);

export const storedFiles = pgTable('stored_files', {
  ...meta(),
  sha256: text('sha256').notNull(),
  originalName: text('original_name').notNull(),
  size: integer('size').notNull(),
  mime: text('mime').notNull(),
  storedPath: text('stored_path').notNull(),
  uploadedBy: text('uploaded_by').notNull(),
});

export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    actorUserId: text('actor_user_id').notNull(),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    at: at('at').notNull(),
  },
  (table) => [index('audit_log_entity').on(table.entity, table.entityId)],
);
