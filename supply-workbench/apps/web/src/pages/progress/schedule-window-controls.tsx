import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, DatePicker, Flex, Typography } from 'antd';
import { localDate, type LocalDate } from '@sw/domain';
import dayjs from 'dayjs';
import { scheduleWindowLabel, shiftScheduleWindow, type ScheduleScale, type ScheduleWindow } from '../../features/progress/index.js';
import { ViewSwitch } from '../../shared/ui/view-switch.js';
import { space } from '../../theme/tokens.js';

const SCALE_LABELS = { day: '日', week: '周', month: '月' } satisfies Record<ScheduleScale, string>;

export function ScheduleWindowControls({ className, label, scale, window, today, onScale, onAnchor }: {
  readonly className?: string;
  readonly label: string;
  readonly scale: ScheduleScale;
  readonly window: ScheduleWindow;
  readonly today: LocalDate;
  readonly onScale: (scale: ScheduleScale) => void;
  readonly onAnchor: (anchor: LocalDate) => void;
}) {
  const unit = SCALE_LABELS[scale];
  const previous = `上一${unit}`;
  const next = `下一${unit}`;
  return (
    <Flex className={className} wrap align="center" gap={space[1]}>
      <ViewSwitch<ScheduleScale> aria-label={label} value={scale}
        options={[{ label: '日', value: 'day' }, { label: '周', value: 'week' }, { label: '月', value: 'month' }]} onChange={onScale} />
      <Flex align="center" gap={space[0]}>
        <Button icon={<LeftOutlined />} aria-label={previous} title={previous}
          onClick={() => onAnchor(shiftScheduleWindow({ scale, window, direction: -1 }).from)} />
        {scale === 'day' ? <DatePicker className="planning-day-picker" aria-label="选择排期日期" value={dayjs(window.from)}
          format="YYYY-MM-DD" allowClear={false} showToday={false}
          onChange={(date) => { if (date !== null) onAnchor(localDate(date.format('YYYY-MM-DD'))); }} />
          : <Typography.Text aria-live="polite" style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {scheduleWindowLabel({ window, today })}
          </Typography.Text>}
        <Button icon={<RightOutlined />} aria-label={next} title={next}
          onClick={() => onAnchor(shiftScheduleWindow({ scale, window, direction: 1 }).from)} />
      </Flex>
      {today < window.from || today > window.to ? <Button onClick={() => onAnchor(today)}>{scale === 'day' ? '今天' : `本${unit}`}</Button> : null}
    </Flex>
  );
}
