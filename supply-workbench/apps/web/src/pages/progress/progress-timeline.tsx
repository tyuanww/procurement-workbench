import { Button, Typography } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import type { ScheduleDay, ScheduleScale, Timeline, TimelineGroup, TimelineRow } from '../../features/progress/index.js';
import { statusColor, bg, border, brand, fontSize, radius, space, text } from '../../theme/tokens.js';

const LEFT_WIDTH = 280;
const TRACK_TOP = 8;
const BAR_HEIGHT = 24;
const MIN_DAY_WIDTH = 40;
const WEEK_DAY_WIDTH = 112;

export function ScheduleTimeline(props: {
  readonly timeline: Timeline;
  readonly scale: ScheduleScale;
  readonly columnLabel?: string;
  readonly hint?: string;
  readonly onOpen: (id: string) => void;
}): ReactNode {
  return (
    <div style={frameStyle()}>
      <div style={scrollStyle()}>
        <div style={gridStyle({ days: props.timeline.days.length, dayWidth: dayWidthOf(props.scale) })}>
          <TimelineHeader days={props.timeline.days} scale={props.scale} columnLabel={props.columnLabel ?? '任务 · 负责人 · 供应商 · 工厂'} />
          {props.timeline.groups.map((group) => (
            <TimelineGroupRows key={group.key} group={group} timeline={props.timeline} dayWidth={dayWidthOf(props.scale)} onOpen={props.onOpen} />
          ))}
        </div>
      </div>
      <div style={footStyle()}>
        <span>{props.hint ?? '点任务条打开 720 任务抽屉，和今日同一组件。'}</span>
        <span>左端虚线表示任务开始日早于本期；右端虚线表示延续到下一期。</span>
      </div>
    </div>
  );
}

export function ScheduleList(props: { readonly timeline: Timeline; readonly onOpen: (id: string) => void }): ReactNode {
  return (
    <div>
      {props.timeline.groups.map((group) => (
        <div key={group.key} style={{ marginBottom: space[3] }}>
          <div style={listGroupHeadStyle()}>
            <Typography.Text strong>{group.name}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>{group.counts}</Typography.Text>
          </div>
          {group.rows.map((row) => (
            <Button key={row.id} type="text" block style={listRowStyle()} onClick={() => props.onOpen(row.id)}>
              <span style={listFaceStyle()}>
                <Typography.Text strong style={{ fontSize: fontSize.body }}>{row.title}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>{row.meta}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>{row.when}</Typography.Text>
              </span>
            </Button>
          ))}
        </div>
      ))}
    </div>
  );
}

function TimelineHeader(props: { readonly days: readonly ScheduleDay[]; readonly scale: ScheduleScale; readonly columnLabel: string }): ReactNode {
  return (
    <>
      <div style={cornerStyle()}>{props.columnLabel}</div>
      {props.days.map((day) => (
        <div key={day.date} style={dayHeadStyle(day)}>
          <span style={{ fontWeight: day.isToday ? 600 : 500 }}>{props.scale === 'week' ? day.label : Number(day.date.slice(8))}</span>
          <span style={weekdayStyle()}>{day.isToday ? '今天' : day.weekday}</span>
        </div>
      ))}
    </>
  );
}

function TimelineGroupRows(props: { readonly group: TimelineGroup; readonly timeline: Timeline; readonly dayWidth: number; readonly onOpen: (id: string) => void }): ReactNode {
  return (
    <>
      <div style={groupRowStyle()}>
        <span style={{ fontWeight: 600 }}>{props.group.name}</span>
        <span style={{ color: text.secondary, fontSize: fontSize.meta }}>{props.group.counts}</span>
      </div>
      {props.group.rows.map((row) => (
        <TimelineRowView key={row.id} row={row} timeline={props.timeline} dayWidth={props.dayWidth} onOpen={() => props.onOpen(row.id)} />
      ))}
    </>
  );
}

function TimelineRowView(props: { readonly row: TimelineRow; readonly timeline: Timeline; readonly dayWidth: number; readonly onOpen: () => void }): ReactNode {
  return (
    <>
      <div style={labelStyle(props.row)}>
        <span style={labelTitleStyle()}>{props.row.title}</span>
        <span style={labelMetaStyle()}>{props.row.meta}</span>
        <span style={labelMetaStyle()}>{props.row.when}</span>
      </div>
      <div style={trackStyle(props.dayWidth)}>
        {props.timeline.todayPercent === null ? null : <span style={todayLineStyle(props.timeline.todayPercent)} />}
        <BarButton row={props.row} onOpen={props.onOpen} />
      </div>
    </>
  );
}

function BarButton(props: { readonly row: TimelineRow; readonly onOpen: () => void }): ReactNode {
  const color = statusColor[props.row.bar.tone];
  return (
    <Button
      size="small"
      aria-label={`${props.row.title} ${props.row.bar.label}`}
      title={`${props.row.title} · ${props.row.when}`}
      onClick={props.onOpen}
      style={barStyle({ bar: props.row.bar, color })}
    >
      {props.row.bar.label}
    </Button>
  );
}

function dayWidthOf(scale: ScheduleScale): number {
  return scale === 'week' ? WEEK_DAY_WIDTH : MIN_DAY_WIDTH;
}

function frameStyle(): CSSProperties {
  return { border: `1px solid ${border}`, borderRadius: radius, background: bg.surface, overflow: 'hidden' };
}

function scrollStyle(): CSSProperties {
  return { overflowX: 'auto' };
}

function gridStyle(input: { readonly days: number; readonly dayWidth: number }): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: `${LEFT_WIDTH}px repeat(${input.days}, ${input.dayWidth}px)`,
    minWidth: LEFT_WIDTH + input.days * input.dayWidth,
  };
}

function cornerStyle(): CSSProperties {
  return {
    position: 'sticky',
    left: 0,
    zIndex: 2,
    background: bg.page,
    color: text.secondary,
    fontSize: fontSize.meta,
    padding: `${space[1]}px ${space[2]}px`,
    borderBottom: `1px solid ${border}`,
    borderRight: `1px solid ${border}`,
  };
}

function dayHeadStyle(day: ScheduleDay): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    padding: `${space[1]}px 0`,
    fontSize: fontSize.meta,
    color: day.isToday ? text.primary : text.secondary,
    background: day.isToday ? brand[100] : day.isWeekend ? bg.page : bg.surface,
    borderBottom: `1px solid ${border}`,
    borderRight: `1px solid ${border}`,
  };
}

function weekdayStyle(): CSSProperties {
  return { color: text.tertiary, fontSize: fontSize.meta };
}

function groupRowStyle(): CSSProperties {
  return {
    gridColumn: '1 / -1',
    display: 'flex',
    gap: space[2],
    alignItems: 'center',
    padding: `${space[1]}px ${space[2]}px`,
    background: bg.page,
    borderBottom: `1px solid ${border}`,
  };
}

function labelStyle(row: TimelineRow): CSSProperties {
  return {
    position: 'sticky',
    left: 0,
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    padding: `${space[1]}px ${space[2]}px`,
    background: row.bar.isCutStart ? bg.page : bg.surface,
    borderBottom: `1px solid ${border}`,
    borderRight: `1px solid ${border}`,
    minWidth: 0,
  };
}

function labelTitleStyle(): CSSProperties {
  return { color: text.primary, fontSize: fontSize.table, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
}

function labelMetaStyle(): CSSProperties {
  return { color: text.tertiary, fontSize: fontSize.meta, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
}

function trackStyle(dayWidth: number): CSSProperties {
  return {
    gridColumn: '2 / -1',
    position: 'relative',
    height: TRACK_TOP * 2 + BAR_HEIGHT,
    backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent ${dayWidth - 1}px, ${border} ${dayWidth - 1}px, ${border} ${dayWidth}px)`,
    borderBottom: `1px solid ${border}`,
  };
}

function todayLineStyle(percent: number): CSSProperties {
  return { position: 'absolute', top: 0, bottom: 0, left: `${percent}%`, width: 2, background: brand[600], zIndex: 1 };
}

function barStyle(input: { readonly bar: TimelineRow['bar']; readonly color: { readonly text: string; readonly bg: string; readonly border: string } }): CSSProperties {
  return {
    position: 'absolute',
    top: TRACK_TOP,
    left: `calc(${input.bar.leftPercent}% + 2px)`,
    width: `calc(${input.bar.widthPercent}% - 4px)`,
    height: BAR_HEIGHT,
    padding: `0 ${space[1]}px`,
    textAlign: 'left',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    color: input.color.text,
    background: input.color.bg,
    borderColor: input.color.border,
    borderStyle: input.bar.isCutStart || input.bar.isCutEnd ? 'dashed' : 'solid',
    zIndex: 2,
    fontSize: fontSize.meta,
  };
}

function footStyle(): CSSProperties {
  return { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: space[2], padding: `${space[1]}px ${space[2]}px`, color: text.tertiary, fontSize: fontSize.meta, background: bg.surface };
}

function listGroupHeadStyle(): CSSProperties {
  return { display: 'flex', gap: space[1], alignItems: 'baseline', paddingBottom: space[1], borderBottom: `1px solid ${border}` };
}

function listRowStyle(): CSSProperties {
  return { height: 'auto', padding: `${space[1]}px 0`, borderBottom: `1px solid ${border}`, borderRadius: 0 };
}

function listFaceStyle(): CSSProperties {
  return { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0 };
}
