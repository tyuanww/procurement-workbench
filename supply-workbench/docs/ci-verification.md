# CI 验证

PR 的 `verify` 工作流按文件改动选择工程、数据库、前端、报表和轻量检查。发生共享代码、依赖或 CI 变更时走全量。打开 `verify` 作业摘要可以核对被测提交和实际执行的作业。

## 复用 PR 验证

仓库所有者发起的同仓 PR 成功通过 `verify` 后，使用 GitHub 的 **Create a merge commit** 合入 `main`，可复用已完成的工程检查。合并提交必须有两个父提交，依次为合并前的 `main` 和已验证的 PR 源提交。工作流还会核对合并前的 `main` 是否与验证基线一致、合并后的文件树是否与 PR 验证时一致，以及 `.github/` 在合并前后是否一致。复用时，`main` 执行轻量检查，摘要链接到原验证轮次。

使用 squash 或 rebase 合并、验证证据不匹配或查询失败时，`main` 按实际改动重新选择检查。

## 核对文档链接和图片

普通 Markdown 和 `supply-workbench/docs/images/` 下的常规非可执行 `.png`、`.jpg`、`.jpeg`、`.gif`、`.webp` 文件可以走轻量检查。图片扩展名不区分大小写。混合改动会同时执行其他文件所需的检查，出现未归类文件时执行全量检查。

将文档和图片提交到本地分支，再从仓库根目录运行轻量检查。检查读取 Git 提交中的文件，报告新出现的缺失链接目标，包括删除图片而引用文档没有改动的情况。

```sh
git fetch https://github.com/tyuanww/shinemage-supply-workbench.git main
python3 -B .github/ci/check_light.py FETCH_HEAD HEAD
```

## 在 GitHub 上验证主分支

从公开仓取回最近的 `main`。用有仓库写入权限的账号触发 `verify`，传入该提交的完整 SHA。

```sh
git fetch https://github.com/tyuanww/shinemage-supply-workbench.git main
release_sha=$(git rev-parse FETCH_HEAD)
gh workflow run verify.yml --repo tyuanww/shinemage-supply-workbench --ref main -f sha="$release_sha"
```

Windows 原生浏览器验收使用同一提交的合成样本、Edge 和一次性 PostgreSQL。验收结果记录提交 SHA 和浏览器实际加载的入口文件指纹。

```sh
gh workflow run windows-acceptance.yml --repo tyuanww/shinemage-supply-workbench --ref main -f sha="$release_sha"
```

## 本机检查

在 `supply-workbench/` 运行 `pnpm verify`。本机浏览器验收需要 Chrome 与 PostgreSQL 工具 `initdb`、`pg_ctl` 和 `createdb`。可用 `PGBIN` 指向 PostgreSQL 的可执行文件目录。提交待验收的版本后，运行 `pnpm verify:e2e`。工作流和浏览器验收写入各自的一次性测试库。
