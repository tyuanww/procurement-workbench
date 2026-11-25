import { Flex, Typography, type TableColumnType } from 'antd';
import type { ReactNode } from 'react';
import { EM_DASH, type StuckTableRow } from '../../features/performance/index.js';
import { formatTableDate } from '../../shared/ui/format.js';
import { fontSize } from '../../theme/tokens.js';

export function mobileStuckColumns({ now, openBatch }: {
  readonly now: Date;
  readonly openBatch: (row: StuckTableRow) => ReactNode;
}): TableColumnType<StuckTableRow>[] {
  return [
    { title: '采购单 / 批次', rowScope: 'row', width: '38%', render: (_value, row) => openBatch(row) },
    {
      title: '商品与卡点',
      render: (_value, row) => <Flex vertical>
        <Typography.Text style={{ overflowWrap: 'anywhere' }}>{row.name}</Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>
          {row.stageLabel} · 停留 {row.daysInStage} 天
        </Typography.Text>
        {row.confirmed === EM_DASH ? null : <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>
          确认到货 {formatTableDate({ iso: row.confirmed, now })}
        </Typography.Text>}
      </Flex>,
    },
  ];
}
