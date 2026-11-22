# 参与开发

## 选择工作目录

克隆公开仓。已有克隆时，进入该仓库的本地目录。

```sh
git clone https://github.com/tyuanww/shinemage-supply-workbench.git
cd shinemage-supply-workbench
git remote -v
```

核对 `origin` 的读写地址。维护者的 `origin` 指向公开仓。使用 fork 时，将 PR 提到公开仓的 `main`。[SHINEMAGE 公开仓](https://github.com/tyuanww/shinemage-supply-workbench)

在 Codex 开新对话时，将当前公开仓目录设为项目的主文件夹。项目约定随仓库版本更新。[项目约定](AGENTS.md)

## 安装依赖并验证

安装 Node.js 24 和 pnpm 11。从仓库根目录进入 `supply-workbench/`，再安装锁定依赖。

```sh
cd supply-workbench
pnpm install --frozen-lockfile
```

按改动范围运行检查。代码改动先运行受影响的用例，需要完整工程检查时运行 `pnpm verify`。[CI 验证](supply-workbench/docs/ci-verification.md)

数据库写入验证使用一次性测试库。将真实表格、数据库备份和部署凭据保存在受控位置。示例导入使用合成表格。[运行手册](supply-workbench/RUNBOOK.md)
