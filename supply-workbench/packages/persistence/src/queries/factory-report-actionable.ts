import { inArray, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { FactoryReportKind } from '@sw/domain';
import { factoryScheduleCells } from '../schema/factory.js';

export function actionableFactoryReport(kind: FactoryReportKind, linkStatus: AnyPgColumn): SQL {
  if (kind === 'customer_supplied') return sql`false`;
  const open = inArray(linkStatus, ['unlinked', 'ambiguous']);
  return kind === 'schedule' ? sql`(${open} and ${hasScheduleDay()})` : open;
}

/** 与 scheduleOf 一致，JSON 的有效业务日和日期列的有效业务日均可挂接。 */
function hasScheduleDay(): SQL {
  const { day, raw } = factoryScheduleCells;
  const rawDay = sql`(${raw}->>'day')`;
  const year = sql`substring(${rawDay}, 1, 4)::int`;
  const month = sql`substring(${rawDay}, 6, 2)::int`;
  const date = sql`substring(${rawDay}, 9, 2)::int`;
  const pattern = '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$';
  // 公历每 400 年重复。平移年份后，旧 JSON 中的 0000 年也可以用 PostgreSQL 校验。
  return sql`((${day} between date '0001-01-01' and date '9999-12-31') is true or
    case when ${rawDay} ~ ${pattern} then extract(month from make_date(${year} + 400, ${month}, 1) + (${date} - 1)) = ${month} else false end)`;
}
