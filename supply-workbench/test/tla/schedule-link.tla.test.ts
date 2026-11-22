import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const jar = process.env.TLA2TOOLS ?? '/tmp/tla2tools.jar';
const canRun = existsSync('/usr/bin/java') && existsSync(jar);

it.skipIf(!canRun)('TLC 检查排产有限模型：多格可共存，待复核仍保持关联', () => {
  const hold = run({ config: 'ScheduleLink.cfg', module: 'ScheduleLink.tla' });
  expect(hold.status).toBe(0);
  expect(hold.out).toContain('No error has been found');
  const unique = run({ config: 'ScheduleUnique.cfg', module: 'ScheduleLink.tla' });
  expect(unique.status).not.toBe(0);
  expect(unique.out).toContain('Invariant UniqueCells is violated');
  expect(unique.out).toContain('c1 |-> "linked"');
  expect(unique.out).toContain('c2 |-> "linked"');
  const review = run({ config: 'ScheduleReview.cfg', module: 'ScheduleReview.tla' });
  expect(review.status).toBe(0);
  expect(review.out).toContain('No error has been found');
});

function run(input: { readonly config: string; readonly module: string }): { readonly status: number; readonly out: string } {
  try {
    const out = execFileSync('java', ['-cp', jar, 'tlc2.TLC', '-deadlock', '-workers', '1', '-config', join(here, input.config), join(here, input.module)], {
      cwd: here,
      encoding: 'utf8',
    });
    return { status: 0, out };
  } catch (error) {
    return { status: exitCode(error), out: exitText(error) };
  }
}

function exitCode(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number') return error.status;
  return 1;
}

function exitText(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  const stdout = 'stdout' in error && typeof error.stdout === 'string' ? error.stdout : '';
  const stderr = 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : '';
  return `${stdout}\n${stderr}`;
}
