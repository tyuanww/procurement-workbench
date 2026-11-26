import { Button, Flex, Modal, Radio, Select, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { useId, useRef, useState, type Ref } from 'react';
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
  const selected = page.paging.factories.find((factory) => factory.id === page.factoryId);
  const isFiltered = page.isFiltered || page.calendar !== undefined;

  function openSummary(scope: ChasePreview['scope']) {
    setSummaryScope(scope);
    page.onCopyChase({ kind: scope });
  }

  function dismiss() {
    setSummaryScope(null);
    page.onCancelCopyPreview?.();
    onClose();
  }

  return <Modal open={open} centered title={preview == null ? '按工厂复制' : '预览内部催货汇总'}
    onCancel={dismiss} closable={{ 'aria-label': preview == null ? '关闭按工厂复制' : '关闭内部催货汇总预览' }}
    destroyOnHidden mask={{ closable: false }} styles={actionDialogStyles} focusable={{ trap: true, focusTriggerAfterClose: true }}
    afterOpenChange={(isOpen) => { if (isOpen) closeButton.current?.focus({ preventScroll: true }); }}
    footer={<CopyFooter page={page} isPreview={preview != null} selected={selected} closeButton={closeButton} onClose={dismiss} />}>
    <Flex className="today-touch" vertical gap="middle">
      {preview == null ? <>
        <FactoryCopy page={page} isFiltered={isFiltered} selectedId={selected?.id ?? null} />
        <ChaseSummaryButtons page={page} isFiltered={isFiltered} onPreview={openSummary} focusScope={summaryScope} />
      </> : <ChasePreviewContent preview={preview} />}
    </Flex>
  </Modal>;
}

function CopyFooter({ page, isPreview, selected, closeButton, onClose }: {
  readonly page: ActionPageControls;
  readonly isPreview: boolean;
  readonly selected: ActionPageControls['paging']['factories'][number] | undefined;
  readonly closeButton: Ref<HTMLButtonElement>;
  readonly onClose: () => void;
}) {
  return <Flex vertical gap="small">
    {page.copyNotice === '' ? null : <Typography.Text role="status">{page.copyNotice}</Typography.Text>}
    <Flex justify="end" gap="small" wrap>
      {isPreview ? <>
        <Button key="back" autoFocus disabled={page.isCopying} onClick={page.onCancelCopyPreview} style={actionDialogTarget}>返回</Button>
        <Button type="primary" loading={page.isCopying} onClick={page.onConfirmCopy} style={actionDialogTarget}>复制内部汇总</Button>
      </> : <>
        <Button key="close" ref={closeButton} onClick={onClose} style={actionDialogTarget}>关闭</Button>
        <Button type="primary" icon={<CopyOutlined aria-hidden />} style={actionDialogTarget}
          disabled={!page.isSettled || page.isCopying || selected === undefined}
          onClick={() => { if (selected !== undefined) page.onCopyChase({ kind: 'factory', id: selected.id }); }}>
          {selected?.count === undefined ? '复制催单' : `复制该厂 ${selected.count} 批`}
        </Button>
      </>}
    </Flex>
  </Flex>;
}

function ChasePreviewContent({ preview }: { readonly preview: ChasePreview }) {
  return <div>
    <Typography.Text>{preview.scope === 'all' ? '今日可催' : '当前筛选'} · {preview.factories.length} 家工厂 · {preview.count} 批（含所有分页）</Typography.Text>
    <ul style={{ overflowWrap: 'anywhere' }}>{preview.factories.map((factory) => <li key={factory.id}>{factory.name} · {factory.count} 批</li>)}</ul>
    <Typography.Text type="secondary">汇总供内部核对。发给工厂时，请选择对应工厂复制。</Typography.Text>
  </div>;
}

function ChaseSummaryButtons({ page, isFiltered, onPreview, focusScope }: {
  readonly page: ActionPageControls;
  readonly isFiltered: boolean;
  readonly onPreview: (scope: ChasePreview['scope']) => void;
  readonly focusScope: ChasePreview['scope'] | null;
}) {
  const counts = page.paging.chaseCounts;
  const scopes: readonly { readonly scope: ChasePreview['scope']; readonly label: string }[] = isFiltered
    ? [{ scope: 'filtered', label: '预览筛选汇总' }, { scope: 'all', label: '预览今日汇总' }]
    : [{ scope: 'all', label: '预览内部汇总' }];
  return <Flex vertical>
    {isFiltered ? <Typography.Text strong>内部汇总</Typography.Text> : null}
    <Flex role="group" aria-label="内部汇总" align="center" gap="small" wrap>
      {scopes.map(({ scope, label }) => {
        const count = page.isSettled ? counts?.[scope] : undefined;
        return <Button key={scope} type="link" size="small" disabled={count === 0 || (scope === 'filtered' && !page.isSettled)}
          aria-busy={page.isCopying && focusScope === scope} autoFocus={focusScope === scope}
          style={{ ...actionDialogTarget, height: 'auto', whiteSpace: 'normal', maxInlineSize: '100%', paddingInline: 0 }}
          onClick={() => { if (!page.isCopying) onPreview(scope); }}>
          {label}{count === undefined ? '' : `（${count} 批）`}
        </Button>;
      })}
    </Flex>
  </Flex>;
}

function FactoryCopy({ page, isFiltered, selectedId }: {
  readonly page: ActionPageControls;
  readonly isFiltered: boolean;
  readonly selectedId: string | null;
}) {
  const radioName = useId();
  const { factories } = page.paging;
  if (!page.isSettled) return <Typography.Text type="secondary" role="status">
    {page.loadError === '' ? '正在更新可催批次…' : '可催批次读取失败'}
  </Typography.Text>;
  if (factories.length === 0) return <Typography.Text type="secondary">当前范围没有可催货的工厂</Typography.Text>;
  const options = factories.map(({ id, name, count }) => ({
    value: id,
    label: count === undefined ? name : `${name} · ${count} 批`,
  }));
  return <Flex vertical align="start" gap="small">
    <Typography.Text type="secondary">{isFiltered ? '当前筛选' : '今日可催'} · 含所有分页</Typography.Text>
    {factories.length > 6
      ? <Select<string> aria-label="催单工厂" placeholder="搜索工厂" value={selectedId}
        showSearch={{ optionFilterProp: 'label' }} virtual={factories.length > 50} disabled={page.isCopying}
        style={{ ...actionDialogTarget, inlineSize: '100%' }} options={options} onChange={page.onFactory} />
      : <Radio.Group role="radiogroup" aria-label="催单工厂" name={radioName} value={selectedId}
        disabled={page.isCopying} orientation="vertical" block>
        {options.map(({ value, label }) => <Radio key={value} value={value} style={{ ...actionDialogTarget, alignItems: 'center', overflowWrap: 'anywhere' }}
          onChange={() => page.onFactory(value)}>{label}</Radio>)}
      </Radio.Group>}
  </Flex>;
}
