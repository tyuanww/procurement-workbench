import { expect, it } from 'vitest';
import { assertDependencyAllowed } from '../../packages/application/src/plan/policies/dependencies.js';

const edge = (fromItemId: string, toItemId: string) => ({ fromItemId, toItemId });

it('合法的前置依赖可以写入', () => {
  expect(() => { assertDependencyAllowed({ edges: [], fromItemId: 'a', toItemId: 'b' }); }).not.toThrow();
  expect(() => { assertDependencyAllowed({ edges: [edge('a', 'b')], fromItemId: 'b', toItemId: 'c' }); }).not.toThrow();
});

it('自环、两节点环和三节点环都被拒绝', () => {
  expect(() => { assertDependencyAllowed({ edges: [], fromItemId: 'a', toItemId: 'a' }); }).toThrow(/自己/);
  expect(() => { assertDependencyAllowed({ edges: [edge('a', 'b')], fromItemId: 'b', toItemId: 'a' }); }).toThrow(/环/);
  expect(() => { assertDependencyAllowed({ edges: [edge('a', 'b'), edge('b', 'c')], fromItemId: 'c', toItemId: 'a' }); }).toThrow(/环/);
  expect(() => { assertDependencyAllowed({ edges: [edge('a', 'b'), edge('b', 'c')], fromItemId: 'c', toItemId: 'b' }); }).toThrow(/环/);
});

it('无关的分支不误判成环', () => {
  expect(() => { assertDependencyAllowed({ edges: [edge('a', 'b'), edge('c', 'd')], fromItemId: 'd', toItemId: 'a' }); }).not.toThrow();
});
