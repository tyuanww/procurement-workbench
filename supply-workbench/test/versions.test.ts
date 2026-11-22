import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

const serverModules = path.resolve(import.meta.dirname, '../apps/server/node_modules');

function installed(name: string): { readonly version: string; readonly peerDependencies?: Record<string, string> } {
  const file = path.join(serverModules, name, 'package.json');
  return packageJson(JSON.parse(readFileSync(file, 'utf8')));
}

function packageJson(value: unknown): { readonly version: string; readonly peerDependencies?: Record<string, string> } {
  if (!isRecord(value) || typeof value.version !== 'string') throw new Error('package.json 没有版本');
  const peers = peersOf(value.peerDependencies);
  return peers === undefined ? { version: value.version } : { version: value.version, peerDependencies: peers };
}

function peersOf(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error('peerDependencies 不是对象');
  const peers: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') throw new Error('peer 不是文本');
    peers[key] = item;
  }
  return peers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

it('Zod 4 和 fastify-type-provider-zod 的 peer 对得上', () => {
  const zod = installed('zod');
  const fastify = installed('fastify');
  const provider = installed('fastify-type-provider-zod');
  expect(zod.version.split('.')[0]).toBe('4');
  expect(fastify.version.split('.')[0]).toBe('5');
  expect(provider.version.split('.')[0]).toBe('7');
  expect(provider.peerDependencies?.zod).toMatch(/4/);
  expect(provider.peerDependencies?.fastify).toMatch(/5/);
});
