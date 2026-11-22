import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

const typedFiles = [
  'packages/**/*.ts',
  'apps/**/*.ts',
  'apps/**/*.tsx',
  'scripts/**/*.ts',
  'test/**/*.ts',
  'tools/**/*.ts',
  'tools/**/*.mts',
  'docker/**/*.mts',
  'vitest.config.ts',
  'vitest.workspace.ts',
];

const booleanName = {
  selector: 'variable',
  types: ['boolean'],
  format: ['PascalCase', 'camelCase'],
  prefix: ['is', 'has', 'can', 'should'],
};

const missingIsNotZero = [
  {
    selector: 'LogicalExpression[operator="??"][right.raw="0"]',
    message: '缺失不能写成 0',
  },
  {
    selector: 'LogicalExpression[operator="||"][right.raw="0"]',
    message: '缺失不能写成 0',
  },
];

const noClock = [
  {
    selector: 'CallExpression[callee.object.name="Date"][callee.property.name="now"]',
    message: 'domain 和 application 不读时钟',
  },
  {
    selector: 'NewExpression[callee.name="Date"][arguments.length=0]',
    message: 'domain 和 application 不读时钟',
  },
  {
    selector: 'CallExpression[callee.object.name="Math"][callee.property.name="random"]',
    message: 'domain 和 application 不读随机数',
  },
  {
    selector: 'Identifier[name="process"]',
    message: 'domain 和 application 不读环境',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'fixtures/**',
      'test/architecture/**',
      '**/*.violation.ts',
      'apps/web/vite.config.ts',
      'packages/persistence/drizzle.config.ts',
    ],
  },
  eslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        console: 'readonly',
        module: 'readonly',
        process: 'readonly',
        require: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      'max-lines': 'off',
    },
  },
  {
    files: ['e2e/**/*.ts', 'docker/start.ts'],
    languageOptions: {
      parser: tseslint.parser,
      sourceType: 'module',
      globals: {
        Document: 'readonly',
        Element: 'readonly',
        HTMLFormElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLInputElement: 'readonly',
        Node: 'readonly',
        console: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        getComputedStyle: 'readonly',
        location: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        URL: 'readonly',
        window: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'off',
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: typedFiles,
  })),
  {
    files: typedFiles,
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'packages/domain/src/nullish-zero.violation.ts',
            'packages/domain/src/type-assertion.violation.ts',
            'packages/application/src/reads-clock.violation.ts',
            'apps/web/src/pages/direct-fetch.violation.ts',
            'test/architecture/conventions/long-function.ts',
            'test/architecture/conventions/many-params.ts',
            'test/architecture/conventions/uses-any.ts',
            'vitest.config.ts',
            'vitest.workspace.ts',
          ],
          defaultProject: 'tsconfig.base.json',
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', { max: 2 }],
      complexity: ['error', { max: 10 }],
      'max-depth': ['error', { max: 3 }],
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'no-empty': 'error',
      'id-denylist': ['error', 'tmp', 'temp', 'foo', 'obj', 'arr', 'val', 'res2'],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/naming-convention': ['error', booleanName],
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: { 'max-lines-per-function': 'off' },
  },
  {
    files: ['packages/domain/**/*.ts', 'packages/application/**/*.ts'],
    rules: {
      'no-magic-numbers': ['error', { ignore: [0, 1, -1] }],
      'no-restricted-syntax': ['error', ...noClock, ...missingIsNotZero],
    },
  },
  {
    files: ['packages/persistence/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', ...missingIsNotZero] },
  },
  {
    files: [
      'packages/domain/src/policies.ts',
      'packages/domain/src/values/local-date.ts',
      'packages/domain/src/values/calendar.ts',
    ],
    rules: { 'no-magic-numbers': 'off' },
  },
  {
    // pg 与 pglite 的 drizzle 事务不在 AppDatabase 联合里，仓库只调用 insert 和 select。全仓只许这一处断言。
    files: ['packages/persistence/src/require-database.ts'],
    rules: { '@typescript-eslint/consistent-type-assertions': 'off' },
  },
  {
    files: ['scripts/**/*.ts'],
    rules: { 'max-lines': 'off', 'no-magic-numbers': 'off' },
  },
  {
    files: [
      'apps/web/src/pages/**/*.{ts,tsx}',
      'apps/web/src/app/**/*.{ts,tsx}',
      'apps/web/src/components/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name="fetch"]',
          message: '页面里不要直接 fetch，走 api client',
        },
      ],
    },
  },
  {
    files: ['apps/web/src/features/shell/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name="fetch"]',
          message: '壳里不要直接 fetch，走 api client',
        },
      ],
    },
  },
  {
    files: ['docker/loader.mts', 'tools/reconcile/loader.mts'],
    rules: { 'max-params': 'off' },
  },
  {
    files: ['vitest.config.ts', 'vitest.workspace.ts'],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['vitest.config.ts', 'vitest.workspace.ts'],
          defaultProject: 'scripts/tsconfig.json',
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
