import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAPABILITY_MANIFEST } from '../packages/contracts/src/index.js';
import { validateCapabilities } from './architecture/capability-validation.js';

const root = path.resolve(import.meta.dirname, '..');

describe('架构不变量', () => {
  it('capability 清单覆盖 application/src 的全部能力目录', () => {
    const directories = listDirectories('packages/application/src')
      .filter((name) => name !== 'ports' && name !== 'shared')
      .sort();
    const webFeatures = listDirectories('apps/web/src/features');
    expect(validateCapabilities({ manifest: CAPABILITY_MANIFEST, directories, webFeatures })).toEqual([]);
  });

  it('适配器不引用 owner、factory-links 或 plan 的能力内部文件', () => {
    const offenders = sourceFiles('packages/persistence/src')
      .filter((file) => /application\/src\/(owner|factory-links|plan)\//.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it('imports 和 follow-up 不直接引用 owner/factory-links 的 stores', () => {
    const offenders = [...sourceFiles('packages/application/src/imports'), ...sourceFiles('packages/application/src/follow-up')]
      .filter((file) => /(owner|factory-links)\/stores/.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it('页面不引用其他页面组件', () => {
    const offenders = sourceFiles('apps/web/src/pages')
      .filter((file) => /from '\.\.\/(today|progress|dashboard|lines|master|products|reports|imports|settings)\//.test(read(file)));
    expect(offenders).toEqual([]);
  });
});

function listDirectories(relative: string): string[] {
  return readdirSync(path.join(root, relative), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

function sourceFiles(relative: string): string[] {
  const base = path.join(root, relative);
  return readdirSync(base, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist') return [];
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) return sourceFiles(child);
    return entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) ? [path.relative(root, path.join(base, entry.name))] : [];
  });
}

function read(relative: string): string {
  return readFileSync(path.join(root, relative), 'utf8');
}
