export type CapabilityCandidate = {
  readonly id: string;
  readonly readPermissions: readonly string[];
  readonly webFeature: string | null;
};

export type CapabilityViolation =
  | { readonly kind: 'missing-directory'; readonly id: string }
  | { readonly kind: 'extra-directory'; readonly id: string }
  | { readonly kind: 'missing-web-feature'; readonly id: string; readonly webFeature: string }
  | { readonly kind: 'duplicate-id'; readonly id: string }
  | { readonly kind: 'missing-read-permission'; readonly id: string };

/**
 * 校验能力清单和目录、前端 feature 是否一致。纯函数，只读输入，不改全局状态；
 * 测试用它挡住"加假能力不报错"和"多一个目录没人认领"。
 */
export function validateCapabilities(input: {
  readonly manifest: readonly CapabilityCandidate[];
  readonly directories: readonly string[];
  readonly webFeatures: readonly string[];
}): readonly CapabilityViolation[] {
  const violations: CapabilityViolation[] = [];
  const ids = input.manifest.map((entry) => entry.id);
  const seen = new Set<string>();
  for (const entry of input.manifest) {
    if (!input.directories.includes(entry.id)) violations.push({ kind: 'missing-directory', id: entry.id });
    if (entry.webFeature !== null && !input.webFeatures.includes(entry.webFeature)) {
      violations.push({ kind: 'missing-web-feature', id: entry.id, webFeature: entry.webFeature });
    }
    if (entry.readPermissions.length === 0) violations.push({ kind: 'missing-read-permission', id: entry.id });
    if (seen.has(entry.id)) violations.push({ kind: 'duplicate-id', id: entry.id });
    seen.add(entry.id);
  }
  for (const directory of input.directories) {
    if (!ids.includes(directory)) violations.push({ kind: 'extra-directory', id: directory });
  }
  return violations;
}
