import { Button, Flex, Modal, Radio, Select, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { useId, useRef, useState } from 'react';
import { actionDialogStyles, actionDialogTarget, type ActionPageControls } from './ActionControls.js';
import type { ChasePreview } from './today-copy.js';

export function ChaseCopyDialog({ page, open, onClose }: {
  readonly page: ActionPageControls;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const [summaryScope, setSummaryScope] = useState<ChasePreview['scope'] | null>(null);
  const preview = summaryScope === null ? null : page.copyPreview;

  function copySummary(scope: ChasePreview['scope']) {
    page.onCancelCopy?.();
    setSummaryScope(scope);
    page.onCopyChase({ kind: scope });
  }

  function dismiss() {
    setSummaryScope(null);
    page.onCancelCopy?.();
    onClose();
  }

  return <Modal open={open} centered title={preview == null ? '按工厂复制催单' : '预览跨厂催货汇总'}
    onCancel={dismiss} closable={{ 'aria-label': preview == null ? '关闭按工厂复制催单' : '关闭跨厂催货汇总预览' }}
    destroyOnHidden mask={{ closable: false }} styles={actionDialogStyles} focusable={{ trap: true, focusTriggerAfterClose: true }}
    afterOpenChange={(isOpen) => { if (isOpen) closeButton.current?.focus({ preventScroll: true }); }}
    footer={<Flex justify="end" gap="small" wrap>
      {preview == null ? <Button key="close" ref={closeButton} onClick={dismiss} style={actionDialogTarget}>关闭</Button> : <>
        <Button key="back" autoFocus disabled={page.isCopying} onClick={page.onCancelCopy} style={actionDialogTarget}>返回</Button>
        <Button type="primary" loading={page.isCopying} onClick={page.onConfirmCopy} style={actionDialogTarget}>复制内部汇总</Button>
      </>}
    </Flex>}>
    <Flex className="today-touch" vertical gap="middle">
      {preview == null ? <>
        <Typography.Text type="secondary">复制催单文本后，请粘贴到工厂沟通渠道并手动发送。</Typography.Text>
        <FactoryCopy page={page} />
        <ChaseSummaryButtons page={page} onCopy={copySummary} focusScope={summaryScope} />
      </> : <ChasePreviewContent preview={preview} />}
      {page.copyNotice === '' ? null : <Typography.Text role="status">{page.copyNotice}</Typography.Text>}
    </Flex>
  </Modal>;
}

function ChasePreviewContent({ preview }: { readonly preview: ChasePreview }) {
  return <div>
    <Typography.Text>{preview.scope === 'all' ? '今日可催' : '当前筛选'} · {preview.factories.length} 家工厂 · {preview.count} 批</Typography.Text>
    <ul>{preview.factories.map((factory) => <li key={factory.id}>{factory.name} · {factory.count} 批</li>)}</ul>
    <Typography.Text type="secondary">汇总供内部核对。发给工厂时，请选择对应工厂复制。</Typography.Text>
  </div>;
}

function ChaseSummaryButtons({ page, onCopy, focusScope }: {
  readonly page: ActionPageControls;
  readonly onCopy: (scope: ChasePreview['scope']) => void;
  readonly focusScope: ChasePreview['scope'] | null;
}) {
  const counts = page.paging.chaseCounts;
  const isFiltered = page.isFiltered || page.calendar !== undefined;
  const filteredCount = page.isSettled ? counts?.filtered : undefined;
  const todayCount = page.work === 'all_unshipped' ? undefined : counts?.all;
  return <Flex role="group" aria-label="内部催单汇总" vertical gap="small">
    <Typography.Text strong>内部汇总</Typography.Text>
    <Flex align="center" gap="small" wrap>
      <ChaseSummaryButton onCopy={onCopy} scope="all" label="复制全部可催（今日汇总）" count={todayCount}
        busy={page.isCopying} autoFocus={focusScope === 'all'} />
      {isFiltered ? <ChaseSummaryButton onCopy={onCopy} scope="filtered" label="复制当前范围催单汇总" count={filteredCount}
        busy={page.isCopying} disabled={!page.isSettled} autoFocus={focusScope === 'filtered'} /> : null}
    </Flex>
  </Flex>;
}

function ChaseSummaryButton({ onCopy, scope, label, count, busy, disabled, autoFocus }: {
  readonly onCopy: (scope: ChasePreview['scope']) => void;
  readonly scope: ChasePreview['scope'];
  readonly label: string;
  readonly count: number | undefined;
  readonly busy: boolean;
  readonly disabled?: boolean;
  readonly autoFocus: boolean;
}) {
  return <Button size="small" icon={<CopyOutlined aria-hidden />} disabled={disabled || count === 0} aria-busy={busy}
    autoFocus={autoFocus} style={{ ...actionDialogTarget, height: 'auto', whiteSpace: 'normal', maxInlineSize: '100%' }}
    onClick={() => { if (!busy) onCopy(scope); }}>
    {label}{count === undefined ? '' : `（${count} 批）`}
  </Button>;
}

function FactoryCopy({ page }: { readonly page: ActionPageControls }) {
  const radioName = useId();
  const { factories } = page.paging;
  const selectedId = factories.find((factory) => factory.id === page.factoryId)?.id ?? null;
  const isFiltered = page.isFiltered || page.calendar !== undefined;
  const isDisabled = !page.isSettled || page.isCopying;
  if (factories.length === 0) return <Typography.Text type="secondary">当前范围没有可催货的工厂</Typography.Text>;
  const options = factories.map(({ id, name, count }) => ({
    value: id,
    label: count === undefined ? name : `${name} · ${count} 批`,
  }));
  return <Flex vertical align="start" gap="small">
    <Typography.Text strong>催单工厂</Typography.Text>
    <Typography.Text type="secondary">批次数量按{isFiltered ? '当前筛选范围' : '今日可催范围'}统计，包含所有分页。</Typography.Text>
    {factories.length > 6
      ? <Select<string> aria-label="催单工厂" placeholder="选择催单工厂" value={selectedId}
        showSearch={{ optionFilterProp: 'label' }} virtual={factories.length > 50} disabled={isDisabled}
        style={{ ...actionDialogTarget, inlineSize: '100%' }} options={options} onChange={page.onFactory} />
      : <Radio.Group aria-label="催单工厂" name={radioName} value={selectedId} disabled={isDisabled} vertical block>
        {options.map(({ value, label }) => <Radio key={value} value={value} style={{ ...actionDialogTarget, alignItems: 'center', overflowWrap: 'anywhere' }}
          onChange={() => page.onFactory(value)}>{label}</Radio>)}
      </Radio.Group>}
    <Button type="primary" icon={<CopyOutlined aria-hidden />} disabled={isDisabled || selectedId === null} style={actionDialogTarget}
      onClick={() => { if (selectedId !== null) page.onCopyChase({ kind: 'factory', id: selectedId }); }}>
      {isFiltered ? '复制该工厂筛选催单' : '复制该工厂催单'}
    </Button>
  </Flex>;
}
