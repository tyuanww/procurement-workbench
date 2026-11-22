export type FactorySnapshotRow = {
  readonly orderLineId: string;
  readonly fingerprint: string;
  readonly qty: number | null;
};

export type FactorySnapshot = {
  readonly batchId: string;
  readonly sourceKey: string;
  readonly fingerprint: string;
  readonly effectiveAt: string;
  readonly committedAt: string;
  readonly rows: readonly FactorySnapshotRow[];
};

export type FactorySnapshotReplayStep = {
  readonly batchId: string;
  readonly sourceKey: string;
  readonly fingerprint: string;
  readonly duplicate: boolean;
  readonly retiredBatchId: string | null;
  readonly activeBatchId: string;
  readonly totals: Readonly<Record<string, number | null>>;
};

export type FactorySnapshotReplay = {
  readonly steps: readonly FactorySnapshotReplayStep[];
  readonly active: Readonly<Record<string, string>>;
  readonly totals: Readonly<Record<string, number | null>>;
};

/**
 * 用于迁移回算和验收的纯快照模型。相同 source/fingerprint 重放不改变有效值，
 * 新快照会退休同一 source 的旧快照，单个快照内按行 fingerprint 去重。
 */
export function replayFactorySnapshots(input: readonly FactorySnapshot[]): FactorySnapshotReplay {
  const ordered = [...input].sort((left, right) => left.committedAt.localeCompare(right.committedAt) || left.batchId.localeCompare(right.batchId));
  const seen = new Set<string>();
  const active = new Map<string, FactorySnapshot>();
  const steps: FactorySnapshotReplayStep[] = [];
  for (const snapshot of ordered) {
    const identity = `${snapshot.sourceKey}:${snapshot.fingerprint}`;
    const previous = active.get(snapshot.sourceKey);
    const isDuplicate = seen.has(identity);
    if (!isDuplicate) {
      seen.add(identity);
      active.set(snapshot.sourceKey, snapshot);
    }
    const current = active.get(snapshot.sourceKey) ?? snapshot;
    steps.push({
      batchId: snapshot.batchId,
      sourceKey: snapshot.sourceKey,
      fingerprint: snapshot.fingerprint,
      duplicate: isDuplicate,
      retiredBatchId: isDuplicate || previous === undefined || previous.batchId === current.batchId ? null : previous.batchId,
      activeBatchId: current.batchId,
      totals: totalsOf(active),
    });
  }
  return { steps, active: activeIds(active), totals: totalsOf(active) };
}

function activeIds(active: ReadonlyMap<string, FactorySnapshot>): Readonly<Record<string, string>> {
  return Object.fromEntries([...active].map(([sourceKey, snapshot]) => [sourceKey, snapshot.batchId]));
}

function totalsOf(active: ReadonlyMap<string, FactorySnapshot>): Readonly<Record<string, number | null>> {
  const totals = new Map<string, number | null>();
  for (const snapshot of active.values()) {
    const rows = new Map<string, FactorySnapshotRow>();
    for (const row of snapshot.rows) rows.set(row.fingerprint, row);
    for (const row of rows.values()) add({ totals, row });
  }
  return Object.fromEntries(totals);
}

function add(input: { readonly totals: Map<string, number | null>; readonly row: FactorySnapshotRow }): void {
  const { totals, row } = input;
  const { key, value } = { key: row.orderLineId, value: row.qty };
  if (value === null) {
    if (!totals.has(key)) totals.set(key, null);
    return;
  }
  const current = totals.get(key);
  if (current === null) return;
  totals.set(key, current === undefined ? value : current + value);
}
