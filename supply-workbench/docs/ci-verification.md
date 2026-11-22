# CI 验证

PR 的 `verify` 工作流按文件改动选择工程、数据库、前端、报表和轻量检查。发生共享代码、依赖或 CI 变更时走全量。打开 `verify` 作业摘要可以核对被测提交和实际执行的作业。

合入 `main` 后，工作流会核对同仓 PR 的成功验证轮次。合并前的主分支提交、PR 源提交和文件树都匹配，并且 CI 配置一致时，主分支执行轻量检查。摘要附有原验证轮次的链接。

手动执行 `verify` 时输入 `main` 历史中的完整提交 SHA，跑该提交的全量检查。

```sh
gh workflow run verify.yml --ref main -f sha="$release_sha"
```

Windows 原生浏览器验收使用同一提交的合成样本、Edge 和一次性 PostgreSQL。验收结果记录提交 SHA 和浏览器实际加载的入口文件指纹。

```sh
gh workflow run windows-acceptance.yml --ref main -f sha="$release_sha"
```

## 本机检查

在 `supply-workbench/` 运行 `pnpm verify`。本机浏览器验收使用 PostgreSQL 的 `initdb` 和 `pg_ctl`，可用 `PGBIN` 指向安装目录。准备 Chrome 后运行 `pnpm verify:e2e`。工作流和浏览器验收写入各自的一次性测试库。
