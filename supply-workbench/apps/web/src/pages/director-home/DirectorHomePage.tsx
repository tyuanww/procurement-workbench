import { Alert, Button, Flex, Skeleton } from 'antd';
import { DirectorBrandsSchema, DirectorScheduleSchema } from '@sw/contracts';
import { businessDay } from '@sw/domain';
import { useEffect, useMemo, useState } from 'react';
import { apiErrorMessage, apiGetWithSignal } from '../../shared/api/client.js';
import { businessTimeZone } from '../../shared/business-time-zone.js';
import { WorkbenchPage } from '../../shared/ui/page.js';
import { meetingStoreLabels } from '../../features/reporting/index.js';
import { space } from '../../theme/tokens.js';
import { DirectorWorkBoard } from './DirectorWorkBoard.js';
import { DirectorProjects } from './DirectorProjects.js';
import { brandIndex, type BrandScope } from './project-register.js';

const root = '/api/v1/dashboard/director';
const readBrands = (signal: AbortSignal) => apiGetWithSignal({ path: root + '/brands', schema: DirectorBrandsSchema, signal });
const readSchedule = (signal: AbortSignal) => apiGetWithSignal({ path: root + '/schedule', schema: DirectorScheduleSchema, signal });
type Load<T> = { value: T; error?: never } | { value?: never; error: string };

function useDirectorRead<T>(read: (signal: AbortSignal) => Promise<T>) {
  const [load, setLoad] = useState<Load<T>>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    read(controller.signal).then((value) => {
      if (!controller.signal.aborted) setLoad({ value });
    }, (error: unknown) => {
      if (!controller.signal.aborted) setLoad({ error: apiErrorMessage(error) ?? '暂时无法读取' });
    });
    return () => controller.abort();
  }, [read, revision]);
  return { load, retry: () => { setLoad(undefined); setRevision((previous) => previous + 1); } };
}

export function DirectorHomePage() {
  const [today] = useState(() => businessDay(new Date().toISOString(), businessTimeZone()));
  const [scope, setScope] = useState<BrandScope>('all');
  const brands = useDirectorRead(readBrands);
  const schedule = useDirectorRead(readSchedule);
  const memberships = useMemo(() => brandIndex(brands.load?.value ?? []), [brands.load]);
  const names = brandNames(brands.load?.value, schedule.load?.value?.brands);
  return <WorkbenchPage title="首页"><Flex vertical gap={space[3]}>
    <BrandButtons names={names} scope={scope} onChange={setScope} />
    {brands.load?.error ? <Alert type="error" title="采购店铺归属暂未读出" action={<Button onClick={brands.retry}>重试</Button>} /> : null}
    <DirectorWorkBoard scope={scope} today={today} memberships={memberships} brandsReady={brands.load?.value !== undefined}>
      {!schedule.load ? <Skeleton active /> : schedule.load.error !== undefined
        ? <Alert type="error" title="新品开发排期暂未读出" description={schedule.load.error} action={<Button onClick={schedule.retry}>重试</Button>} />
        : <DirectorProjects key={scope} schedule={schedule.load.value} scope={scope} />}
    </DirectorWorkBoard>
  </Flex></WorkbenchPage>;
}

function brandNames(members: Awaited<ReturnType<typeof readBrands>> | undefined, sources: readonly string[] | undefined) {
  const names = new Set([meetingStoreLabels.dafuyan, meetingStoreLabels.yiling, ...(sources ?? [])]);
  for (const row of members ?? []) if (row.brand) names.add(row.brand);
  return [...names];
}

function BrandButtons({ names, scope, onChange }: {
  readonly names: string[]; readonly scope: BrandScope; readonly onChange: (value: BrandScope) => void;
}) {
  const choices: [BrandScope, string][] = [['all', '全部店铺'], ...names.map((name): [BrandScope, string] => [`brand:${name}`, name]), ['unassigned', '未分店铺']];
  return <Flex role="group" aria-label="店铺范围" wrap gap={space[1]}>
    {choices.map(([value, label]) => <Button key={value} aria-pressed={value === scope} type={value === scope ? 'primary' : 'default'}
      onClick={() => onChange(value)}>{label}</Button>)}
  </Flex>;
}
