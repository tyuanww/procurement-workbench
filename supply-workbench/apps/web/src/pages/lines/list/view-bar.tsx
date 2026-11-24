import { Button, Checkbox, Popover, Tag } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { LINE_DESK_PINNED_KEY } from '@sw/domain';
import { deskAddress, exportAddress, lineTableLayout, renderedLineColumns, type LineDeskView } from '../../../features/follow-up/index.js';
import { useShellViewport } from '../../../features/shell/index.js';
import { ViewSwitch } from '../../../shared/ui/view-switch.js';
import { bg, radiusCard, space } from '../../../theme/tokens.js';
import { saveCurrent } from './actions.js';
import { SaveViewButton } from './SaveViewButton.js';

export type SavedView = LineDeskView;

export type ColumnView = {
  readonly key: string;
  readonly title: string;
};

export type Density = 'small' | 'middle';

type SearchWriter = (next: URLSearchParams) => void;

export type ViewBarProps = {
  readonly search: string;
  readonly query: string;
  readonly views: readonly SavedView[];
  readonly userId: string;
  readonly columns: readonly ColumnView[];
  readonly density: Density;
  readonly hiddenKeys: readonly string[];
  readonly setMessage: (message: string) => void;
  readonly setParams: SearchWriter;
};

const DENSITY_PARAM = 'density';
const HIDDEN_PARAM = 'hide';
const VIEW_PARAM = 'view';
const FIXED_COLUMN = LINE_DESK_PINNED_KEY;
const NON_FILTER_PARAMS: readonly string[] = ['page', 'pageSize', DENSITY_PARAM, HIDDEN_PARAM, VIEW_PARAM];
const DENSITY_OPTIONS = [
  { label: '紧凑', value: 'small' },
  { label: '舒适', value: 'middle' },
] satisfies { readonly label: string; readonly value: Density }[];

export function readDensity(search: string): Density {
  return new URLSearchParams(search).get(DENSITY_PARAM) === 'middle' ? 'middle' : 'small';
}

export function readHiddenColumns(search: string): readonly string[] {
  const raw = new URLSearchParams(search).get(HIDDEN_PARAM);
  if (raw === null || raw === '') return [];
  return raw.split(',').filter((key) => key !== '');
}

export function densityAddress(input: { readonly search: string; readonly density: Density }): URLSearchParams {
  const next = new URLSearchParams(input.search);
  if (input.density === 'small') next.delete(DENSITY_PARAM);
  else next.set(DENSITY_PARAM, input.density);
  return next;
}

export function hiddenAddress(input: { readonly search: string; readonly hiddenKeys: readonly string[] }): URLSearchParams {
  const next = new URLSearchParams(input.search);
  if (input.hiddenKeys.length === 0) next.delete(HIDDEN_PARAM);
  else next.set(HIDDEN_PARAM, input.hiddenKeys.join(','));
  return next;
}

export function toggleColumn(input: { readonly search: string; readonly hiddenKeys: readonly string[]; readonly key: string }): URLSearchParams {
  if (input.key === FIXED_COLUMN) return new URLSearchParams(input.search);
  const hasKey = input.hiddenKeys.includes(input.key);
  const nextKeys = hasKey ? input.hiddenKeys.filter((key) => key !== input.key) : [...input.hiddenKeys, input.key];
  return hiddenAddress({ search: input.search, hiddenKeys: nextKeys });
}

export function filterSignature(search: string): string {
  const params = deskAddress(search);
  for (const key of NON_FILTER_PARAMS) params.delete(key);
  if (params.get('lane') === 'finished') params.delete('lane');
  const pairs: string[] = [];
  for (const [key, value] of params) pairs.push(`${key}=${value}`);
  return pairs.sort().join('&');
}

export function selectedViewOf(input: { readonly search: string; readonly views: readonly SavedView[] }): SavedView | undefined {
  const id = new URLSearchParams(input.search).get(VIEW_PARAM);
  if (id === null) return undefined;
  return input.views.find((view) => view.id === id);
}

export function isViewModified(input: { readonly search: string; readonly view: SavedView | undefined }): boolean {
  if (input.view === undefined) return false;
  return filterSignature(input.search) !== filterSignature(viewAddress({ search: input.search, view: input.view }).toString());
}

export function viewAddress(input: { readonly search: string; readonly view: SavedView }): URLSearchParams {
  const next = new URLSearchParams(input.view.query);
  const current = new URLSearchParams(input.search);
  if (input.view.preserveLane === true) copyParam({ from: current, to: next, key: 'lane' });
  else if (!next.has('lane')) next.set('lane', 'all');
  if (!next.has('importBatchId')) copyParam({ from: current, to: next, key: 'importBatchId' });
  copyParam({ from: current, to: next, key: DENSITY_PARAM });
  copyParam({ from: current, to: next, key: HIDDEN_PARAM });
  next.set(VIEW_PARAM, input.view.id);
  return next;
}

export function clearFiltersAddress(search: string): URLSearchParams {
  const next = new URLSearchParams();
  const current = new URLSearchParams(search);
  copyParam({ from: current, to: next, key: 'lane' });
  copyParam({ from: current, to: next, key: 'importBatchId' });
  copyParam({ from: current, to: next, key: DENSITY_PARAM });
  copyParam({ from: current, to: next, key: HIDDEN_PARAM });
  return next;
}

export function saveAddress(query: string): string {
  const params = deskAddress(query);
  for (const key of NON_FILTER_PARAMS) params.delete(key);
  if (!params.has('lane')) params.set('lane', 'finished');
  return params.toString();
}

export function hideableColumns<T extends ColumnView>(columns: readonly T[]): readonly T[] {
  return columns.filter((column) => column.key !== FIXED_COLUMN);
}

export { exportAddress };

export function visibleColumns<T extends ColumnView>(input: { readonly columns: readonly T[]; readonly hiddenKeys: readonly string[] }): readonly T[] {
  return renderedLineColumns({ columns: input.columns, hiddenKeys: input.hiddenKeys, layout: 'desk' });
}

export function LineViewBar(props: ViewBarProps): ReactNode {
  const selected = selectedViewOf({ search: props.search, views: props.views });
  const isModified = isViewModified({ search: props.search, view: selected });
  const viewport = useShellViewport();
  const shown = shownColumns(props, viewport);
  const isPhone = viewport.band === 'phone';
  const actions = <>
    {selected === undefined || !isModified ? null : <ModifiedActions search={props.search} view={selected} setParams={props.setParams} />}
    {selected === undefined ? null : <Button onClick={() => props.setParams(clearFiltersAddress(props.search))}>退出视图</Button>}
    <SaveViewButton isDisabled={props.userId === ''} onSave={(label) => saveAsView(props, label)} />
  </>;
  if (isPhone) {
    return (
      <div style={phoneViewRowStyle()}>
        <ViewPicker search={props.search} views={props.views} setParams={props.setParams} />
        <div style={phoneActionsStyle()}>
          <div style={viewClusterStyle()}>
            {actions}
          </div>
          <DisplayControl shown={shown} density={props.density} query={props.query} search={props.search} setParams={props.setParams} />
        </div>
      </div>
    );
  }
  return (
    <div style={viewRowStyle()}>
      <div style={viewClusterStyle()}>
        <ViewPicker search={props.search} views={props.views} setParams={props.setParams} />
        {actions}
      </div>
      <div style={viewRightStyle()}>
        <ColumnControl columns={props.columns} hiddenKeys={props.hiddenKeys} search={props.search} setParams={props.setParams} />
        <DensityControl density={props.density} search={props.search} setParams={props.setParams} />
        <Button href={exportAddress({ query: props.query, columns: shown })}>导出 Excel</Button>
      </div>
    </div>
  );
}

function shownColumns(props: ViewBarProps, viewport: { readonly band: string; readonly isNarrow: boolean }) {
  return renderedLineColumns({
    columns: props.columns,
    hiddenKeys: props.hiddenKeys,
    layout: lineTableLayout(viewport),
  });
}

function DisplayControl(props: {
  readonly shown: readonly ColumnView[];
  readonly density: Density;
  readonly query: string;
  readonly search: string;
  readonly setParams: SearchWriter;
}): ReactNode {
  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      content={<DisplayMenu {...props} />}
    >
      <Button>显示</Button>
    </Popover>
  );
}

function DisplayMenu(props: {
  readonly shown: readonly ColumnView[];
  readonly density: Density;
  readonly query: string;
  readonly search: string;
  readonly setParams: SearchWriter;
}): ReactNode {
  return (
    <div style={displayMenuStyle()}>
      <DensityControl density={props.density} search={props.search} setParams={props.setParams} />
      <Button href={exportAddress({ query: props.query, columns: props.shown })}>导出 Excel</Button>
    </div>
  );
}

function phoneViewRowStyle(): CSSProperties {
  return { display: 'flex', flexDirection: 'column', gap: space[1], minHeight: 72 };
}

function phoneActionsStyle(): CSSProperties {
  return { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[1] };
}

function displayMenuStyle(): CSSProperties {
  return { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: space[2], padding: space[2], background: bg.surface, borderRadius: radiusCard };
}

function ViewPicker(props: {
  readonly search: string;
  readonly views: readonly SavedView[];
  readonly setParams: SearchWriter;
}): ReactNode {
  const selected = selectedViewOf({ search: props.search, views: props.views });
  return (
    <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
      <ViewSwitch
        aria-label="常用视图"
        options={props.views.map((view) => ({ label: view.label, value: view.id }))}
        value={selected?.id ?? ''}
        style={{ width: 'max-content' }}
        onChange={(picked) => applyPickedView({ search: props.search, views: props.views, setParams: props.setParams, picked })}
      />
    </div>
  );
}

function applyPickedView(input: { readonly search: string; readonly views: readonly SavedView[]; readonly setParams: SearchWriter; readonly picked: string }): void {
  const view = input.views.find((item) => item.id === input.picked);
  if (view === undefined) return;
  input.setParams(viewAddress({ search: input.search, view }));
}

function ModifiedActions(props: { readonly search: string; readonly view: SavedView; readonly setParams: SearchWriter }): ReactNode {
  return (
    <>
      <Tag>已修改</Tag>
      <Button onClick={() => props.setParams(viewAddress({ search: props.search, view: props.view }))}>清除</Button>
    </>
  );
}

function saveAsView(props: Pick<ViewBarProps, 'search' | 'userId' | 'setMessage' | 'setParams'>, label: string): boolean {
  const query = saveAddress(props.search);
  const id = saveCurrent({ userId: props.userId, search: query, label, setMessage: props.setMessage });
  if (id === undefined) return false;
  props.setParams(viewAddress({ search: props.search, view: { id, label: id, query } }));
  return true;
}

function ColumnControl(props: { readonly columns: readonly ColumnView[]; readonly hiddenKeys: readonly string[]; readonly search: string; readonly setParams: SearchWriter }): ReactNode {
  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      content={<ColumnMenu columns={props.columns} hiddenKeys={props.hiddenKeys} search={props.search} setParams={props.setParams} />}
    >
      <Button>列</Button>
    </Popover>
  );
}

function ColumnMenu(props: { readonly columns: readonly ColumnView[]; readonly hiddenKeys: readonly string[]; readonly search: string; readonly setParams: SearchWriter }): ReactNode {
  const hidden = new Set(props.hiddenKeys);
  return (
    <div style={columnMenuStyle()}>
      {hideableColumns(props.columns).map((column) => (
        <Checkbox
          key={column.key}
          checked={!hidden.has(column.key)}
          onChange={() => props.setParams(toggleColumn({ search: props.search, hiddenKeys: props.hiddenKeys, key: column.key }))}
        >
          {column.title}
        </Checkbox>
      ))}
    </div>
  );
}

function DensityControl(props: { readonly density: Density; readonly search: string; readonly setParams: SearchWriter }): ReactNode {
  return (
    <ViewSwitch<Density>
      aria-label="列表密度"
      value={props.density}
      options={DENSITY_OPTIONS}
      onChange={(density) => props.setParams(densityAddress({ search: props.search, density }))}
    />
  );
}

function copyParam(input: { readonly from: URLSearchParams; readonly to: URLSearchParams; readonly key: string }): void {
  const value = input.from.get(input.key);
  if (value === null) input.to.delete(input.key);
  else input.to.set(input.key, value);
}

function viewRowStyle(): CSSProperties {
  return { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: space[1], minHeight: 40 };
}

function viewClusterStyle(): CSSProperties {
  return { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: space[1], minWidth: 0 };
}

function viewRightStyle(): CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: space[1], marginLeft: 'auto' };
}

function columnMenuStyle(): CSSProperties {
  return { display: 'flex', flexDirection: 'column', gap: space[1], padding: space[2], background: bg.surface, borderRadius: radiusCard };
}
