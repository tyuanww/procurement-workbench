import { Card, Empty } from 'antd';
import { Link } from 'react-router';
import { ArrivalMemos, TodayDrawer, arrivalMemoButtonId, arrivalShortcutPath, type ArrivalTiming, type ArrivalsView, type ReceiptWork } from '../../features/today/index.js';

const ARRIVAL_TIMING_TITLES = { overdue: '到仓逾期', due_today: '今日应到' } satisfies Record<ArrivalTiming, string>;

export function arrivalsTitle(timing: ArrivalTiming | undefined): string {
  return timing === undefined ? '在途待收' : ARRIVAL_TIMING_TITLES[timing];
}

export function visibleArrivals(memos: readonly ReceiptWork[], timing: ArrivalTiming | undefined) {
  return timing === undefined ? memos : memos.filter((memo) => memo.status === timing);
}

export function ArrivalsPane({ view, memos, search, drawerId, onOpen, onClose }: {
  readonly view: ArrivalsView;
  readonly memos: readonly ReceiptWork[];
  readonly search: string;
  readonly drawerId: string | null;
  readonly onOpen: (id: string) => void;
  readonly onClose: () => void;
}) {
  const returnSearch = new URLSearchParams(search).get('actionReturn') ?? '';
  const rows = visibleArrivals(memos, view.timing);
  const receipt = rows.find(({ batchId }) => drawerId === 'batch:' + batchId);
  const title = arrivalsTitle(view.timing);
  return <>
    {view.timing === undefined ? null : <Link style={{ alignSelf: 'flex-start' }} to={arrivalShortcutPath({ returnSearch })}>查看全部在途</Link>}
    <Card size="small">
      {rows.length === 0 ? <Empty description={`当前没有${title}批次。`} />
        : <ArrivalMemos memos={rows} today={{ focusBatch: receipt === undefined ? view.focusBatch : null,
          title: view.timing === undefined ? '待收批次' : title, onOpen: (batchId) => onOpen('batch:' + batchId) }} />}
    </Card>
    <TodayDrawer row={null} drawerId={drawerId} receipt={receipt} isOpen={receipt !== undefined} keyboard
      returnFocusId={receipt === undefined ? undefined : arrivalMemoButtonId(receipt.batchId)}
      draft={null} hadDate={false} lane="finished" isSaving={false} saveError=""
      onClose={onClose} onQuick={noop} onDraft={noop} onSubmit={noop} />
  </>;
}

function noop(): void {
  return undefined;
}
