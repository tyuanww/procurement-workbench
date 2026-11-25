import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Flex, Typography } from 'antd';
import type { LocalDate } from '@sw/domain';
import { scheduleWindowLabel, shiftScheduleWindow, type ScheduleScale, type ScheduleWindow } from '../../features/progress/index.js';
import { ViewSwitch } from '../../shared/ui/view-switch.js';
import { space } from '../../theme/tokens.js';

export function ScheduleWindowControls({ label, scale, window, today, onScale, onAnchor }: {
  readonly label: string;
  readonly scale: ScheduleScale;
  readonly window: ScheduleWindow;
  readonly today: LocalDate;
  readonly onScale: (scale: ScheduleScale) => void;
  readonly onAnchor: (anchor: LocalDate) => void;
}) {
  const unit = scale === 'week' ? '周' : '月';
  const previous = `上一${unit}`;
  const next = `下一${unit}`;
  return (
    <Flex wrap align="center" gap={space[1]}>
      <ViewSwitch<ScheduleScale> aria-label={label} value={scale}
        options={[{ label: '周', value: 'week' }, { label: '月', value: 'month' }]} onChange={onScale} />
      <Flex align="center" gap={space[0]}>
        <Button icon={<LeftOutlined />} aria-label={previous} title={previous}
          onClick={() => onAnchor(shiftScheduleWindow({ scale, window, direction: -1 }).from)} />
        <Button onClick={() => onAnchor(today)}>本期</Button>
        <Button icon={<RightOutlined />} aria-label={next} title={next}
          onClick={() => onAnchor(shiftScheduleWindow({ scale, window, direction: 1 }).from)} />
      </Flex>
      <Typography.Text aria-live="polite" style={{ fontVariantNumeric: 'tabular-nums' }}>{scheduleWindowLabel({ window, today })}</Typography.Text>
    </Flex>
  );
}
