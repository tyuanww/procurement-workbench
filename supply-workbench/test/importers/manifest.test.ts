import { expect, it } from 'vitest';
import { TEMPLATE_IDS } from '../../packages/domain/src/index.js';
import { importManifests, installTemplateManifests } from '../../packages/importers/src/registry.js';

it('manifest 暴露完整描述，注册表只安装清单', () => {
  expect(importManifests.map((item) => item.id)).toEqual([...TEMPLATE_IDS]);
  for (const manifest of importManifests) {
    expect(manifest.id, manifest.id).toBeTypeOf('string');
    expect(manifest.label, manifest.id).toBeTypeOf('string');
    expect(manifest.requiresFactory, manifest.id).toBeTypeOf('boolean');
    expect(manifest.columns, manifest.id).toBeInstanceOf(Array);
    for (const field of ['detect', 'parse', 'diff', 'identityOf', 'existingFrom', 'factsOf', 'commit'] as const) {
      expect(manifest[field], `${manifest.id} ${field}`).toBeTypeOf('function');
    }
  }
  const installed = installTemplateManifests(importManifests);
  expect(installed.templates.map((item) => item.id)).toEqual([...TEMPLATE_IDS]);
  expect(installed.executors.map((item) => item.template)).toEqual([...TEMPLATE_IDS]);
});

it('测试专用清单项只经过安装函数，不进生产模板和去向', () => {
  const first = importManifests[0];
  if (first === undefined) throw new Error('清单为空');
  const fake = { ...first, id: 'probe-contract-v2', label: '契约探针', importTemplate: () => null };
  const installed = installTemplateManifests([...importManifests, fake]);
  expect(installed.templates.map((item) => item.id)).toEqual([...TEMPLATE_IDS]);
  expect(installed.executors.map((item) => item.template)).toEqual([...TEMPLATE_IDS]);
});

it('安装清单拒绝重复 id 和空列', () => {
  const first = importManifests[0];
  if (first === undefined) throw new Error('清单为空');
  expect(() => installTemplateManifests([first, first])).toThrow('重复');
  expect(() => installTemplateManifests([{ ...first, columns: [] }])).toThrow('列');
});
