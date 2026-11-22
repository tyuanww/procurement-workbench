import { localDate } from './values/local-date.js';
import type { LocalDate } from './values/local-date.js';
import type { EntityId } from './values/ids.js';

// 这个文件的职责就是给业务数字起名字。lint 不在这里禁数字。
export const UNDO_WINDOW_SECONDS = 10;
export const LOW_SAMPLE_THRESHOLD = 5;
export const IMPORT_STALE_DAYS = 7;
export const BYTES_PER_MEBIBYTE = 1024 * 1024;
export const IMPORT_FILE_MAX_BYTES = 50 * BYTES_PER_MEBIBYTE;
export const ATTACHMENT_MAX_BYTES = 10 * BYTES_PER_MEBIBYTE;
export const STUCK_BUCKET_MAX_DAYS = [3, 7, 14] as const;
export const DEFAULT_UPCOMING_DAYS = 3;
export const DEFAULT_MISSING_DATE_HINT_WINDOW_DAYS = 7;
export const FOLLOW_UP_BULK_MAX = 100;

export type Settings = {
  readonly upcomingDays: number;
  readonly shippedNotReceivedAlertDays: number | null;
  readonly deliveryNoteAlertDays: number | null;
  readonly missingDateHintWindowDays: number;
  readonly dateSanityRange: { readonly from: LocalDate; readonly to: LocalDate };
  readonly ownWarehousePartyId: EntityId | null;
};

export const DEFAULT_SETTINGS: Settings = {
  upcomingDays: DEFAULT_UPCOMING_DAYS,
  shippedNotReceivedAlertDays: null,
  deliveryNoteAlertDays: null,
  missingDateHintWindowDays: DEFAULT_MISSING_DATE_HINT_WINDOW_DAYS,
  dateSanityRange: {
    from: localDate('2020-01-01'),
    to: localDate('2030-12-31'),
  },
  ownWarehousePartyId: null,
};
