# CI 验证

PR 的 `verify` 工作流按文件改动选择工程、数据库、前端、报表和轻量检查。发生共享代码、依赖或 CI 变更时走全量。打开 `verify` 作业摘要可以核对被测提交和实际执行的作业。

合入 `main` 后，工作流会核对同仓 PR 的成功验证轮次。合并前的主分支提交、PR 源提交和文件树都匹配，并且 CI 配置一致时，主分支执行轻量检查。摘要附有原验证轮次的链接。

## 核对文档链接

将文档改动提交到本地分支。在仓库根目录运行链接检查。

```sh
git fetch origin
python3 -B .github/ci/check_light.py origin/main HEAD
```

## 在 GitHub 上验证主分支

从公开仓取回最近的 `main`。用有仓库写入权限的账号触发 `verify`，传入该提交的完整 SHA。

```sh
git fetch origin
release_sha=$(git rev-parse origin/main)
gh workflow run verify.yml --repo tyuanww/shinemage-supply-workbench --ref main -f sha="$release_sha"
```

Windows 原生浏览器验收使用同一提交的合成样本、Edge 和一次性 PostgreSQL。验收结果记录提交 SHA 和浏览器实际加载的入口文件指纹。

```sh
gh workflow run windows-acceptance.yml --repo tyuanww/shinemage-supply-workbench --ref main -f sha="$release_sha"
```

## 本机检查

在 `supply-workbench/` 运行 `pnpm verify`。本机浏览器验收需要 Chrome 与 PostgreSQL 工具 `initdb`、`pg_ctl` 和 `createdb`。可用 `PGBIN` 指向 PostgreSQL 的可执行文件目录。提交待验收的版本后，运行 `pnpm verify:e2e`。工作流和浏览器验收写入各自的一次性测试库。
