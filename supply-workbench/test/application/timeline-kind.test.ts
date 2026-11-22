import { expectTypeOf, it } from 'vitest';
import type { TimelineEvent } from '../../packages/application/src/follow-up/boundary.js';
import type { TimelineKind } from '../../packages/domain/src/index.js';

it('时间线种类和事件 kind 是同一组码', () => {
  expectTypeOf<TimelineKind>().toEqualTypeOf<TimelineEvent['kind']>();
});
