import type { MemoryState } from './state.js';

export type MemoryBox = {
  current: MemoryState;
  depth: number;
};
