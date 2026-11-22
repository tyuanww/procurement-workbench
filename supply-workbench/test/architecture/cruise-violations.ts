import base from '../../.dependency-cruiser.ts';

const { tsConfig, ...cruiseOptions } = base.options;

export default {
  ...base,
  options: {
    ...cruiseOptions,
    tsPreCompilationDeps: false,
    exclude: { path: 'node_modules' },
  },
};

void tsConfig;
