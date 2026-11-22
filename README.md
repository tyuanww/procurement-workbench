# SHINEMAGE 供应链工作台

采购、产品和管理团队可以用采购表建立订单进度，按批次跟进排期、发货和收货。采购在今日行动板看待催事项和到仓备忘录。管理店铺显示达肤妍、译龄及总排期。产品经理可以跟进新品节点，管理层可以查看看板并生成管理周会或全店周报。

## 本地使用

按运行手册启动 PostgreSQL 和工作台，再导入合成采购表。工作台默认监听 `127.0.0.1:8080`。[启动工作台并导入样本](supply-workbench/RUNBOOK.md)

## 继续开发

- 从公开仓准备工作目录并安装依赖。[参与开发](CONTRIBUTING.md)
- 新增导入模板、能力或页面。[扩展生成器](supply-workbench/docs/extension-generator.md)
- 核对改动范围和验收结果。[CI 验证](supply-workbench/docs/ci-verification.md)
- 查找视觉规范和代码约定。[设计规范](supply-workbench/DESIGN.md) · [项目约定](AGENTS.md)

示例采购表采用合成数据。真实业务文件可保存在本机的 `local-data/` 或有访问控制的部署环境，再按需导入。[合成采购表](supply-workbench/fixtures/synthetic/po-master-procurement.xlsx)

## 许可证

源码采用 [MIT 许可证](LICENSE)。
