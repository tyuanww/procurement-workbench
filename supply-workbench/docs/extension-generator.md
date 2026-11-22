# 用生成器新增模板、能力或页面

生成器创建初始文件和清单项。进入 `supply-workbench/`，选择与你的改动对应的命令。

## 预览文件改动

先运行对应的 `--dry-run` 命令。终端会列出目标文件和要更新的清单。

```sh
pnpm new:template demo-template-v1 --dry-run
pnpm new:capability demo-capability --dry-run
pnpm new:feature demo-status --dry-run
```

模板 ID 使用短横线连接小写单词，并加版本后缀，例如 `demo-template-v1`。能力和页面 ID 使用短横线连接小写单词。选择仓库中尚未使用的 ID。

## 生成文件

确认预览后，去掉 `--dry-run` 再运行。按业务需求充实生成的文件。

| 命令 | 生成的文件 | 更新的清单 |
| --- | --- | --- |
| `pnpm new:template demo-template-v1` | `packages/importers/src/templates/demo-template-v1/index.ts` | [模板 ID](../packages/domain/src/vocabulary/imports.ts)和[模板注册表](../packages/importers/src/registry.ts) |
| `pnpm new:capability demo-capability` | `packages/application/src/demo-capability/index.ts` | [能力清单](../packages/contracts/src/capabilities.ts) |
| `pnpm new:feature demo-status` | `apps/web/src/pages/demo-status/DemoStatusPage.tsx` | [页面清单](../apps/web/src/app/page-manifest.tsx) |

模板生成后，实现检测、解析、差异和提交逻辑。能力生成后，按需要配置 API 和权限。页面生成后，填写 UI 并验证页面入口和 API 权限。

## 移除本次生成的文件

确认你要移除目标目录和对应的清单项后，运行同一条命令并加上 `--remove`。`--dry-run` 和 `--remove` 分开使用。运行 `git diff --stat` 回读剩下的改动。

生成、重复 ID 和移除行为由生成器测试覆盖。[生成器测试](../test/architecture/generator.test.ts) · [CI 验证](ci-verification.md)
