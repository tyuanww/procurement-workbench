# SHINEMAGE 供应链工作台｜项目约定

## 维护源

- 项目的公开上游是 `tyuanww/shinemage-supply-workbench`。开发和推送前，在实际工作目录核对 Git 远端。[参与开发](CONTRIBUTING.md)
- 应用位于 `supply-workbench/`。查找运行、验证和扩展入口时，从仓库 README 开始。[仓库入口](README.md)

## 二次开发

- 先确定角色、业务对象、触发条件和可观察结果。订单行、要货批次和导入批次各有自己的用途。改交期、导入或统计口径时，核对受影响的今日、进度、看板和周报。
- 新增能力、页面或导入模板前，先用扩展生成器的 `--dry-run` 核对影响。以代码清单为准。[扩展生成器](supply-workbench/docs/extension-generator.md) · [能力清单](supply-workbench/packages/contracts/src/capabilities.ts) · [页面清单](supply-workbench/apps/web/src/app/page-manifest.tsx) · [模板注册表](supply-workbench/packages/importers/src/registry.ts)
- 页面可见性和 API 授权分别验证。涉及内部需求时，使用有权限的需求与验收资料确认业务口径。

## 验证和数据

- 按改动范围运行工程检查。验证数据库写入时使用一次性测试库。[CI 验证](supply-workbench/docs/ci-verification.md)
- 仓库示例使用合成数据。将真实业务数据和生产配置保存在受控位置。杭州生产发布另行确认。
