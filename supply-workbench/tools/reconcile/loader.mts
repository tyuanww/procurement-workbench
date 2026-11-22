import { access } from 'node:fs/promises';
import type { ResolveHook } from 'node:module';
import { fileURLToPath } from 'node:url';

export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
  if (!specifier.startsWith('.') || !specifier.endsWith('.js') || context.parentURL === undefined) {
    return nextResolve(specifier, context);
  }
  const ts = new URL(specifier.replace(/\.js$/u, '.ts'), context.parentURL);
  try {
    await access(fileURLToPath(ts));
    return { url: ts.href, shortCircuit: true };
  } catch {
    return nextResolve(specifier, context);
  }
};
