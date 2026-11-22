# 采购工作台

采购、产品和管理团队可以用采购表建立订单进度，按批次跟进排期、发货和收货。采购在今日行动板看待催事项和到仓备忘录。管理层通过卡点、供应商表现、采购负荷和项目进度查看明细。产品经理可以看新品节点及交期预警，周会可以生成全店周报。

## 本地打开

使用 Docker Compose 启动 PostgreSQL 和应用。应用默认监听 `127.0.0.1:8080`。启动和导入步骤见[运行手册](supply-workbench/RUNBOOK.md)。

项目使用 Node.js 24 和 pnpm 11。在 `supply-workbench/` 安装锁定依赖后，可以从命令行运行工程验证。

```sh
cd supply-workbench
pnpm install --frozen-lockfile
pnpm verify
```

示例采购表在[合成样本目录](supply-workbench/fixtures/synthetic/)。[CI 说明](supply-workbench/docs/ci-verification.md)记录验证范围、临时数据库和 Windows 验收方法。[设计规范](supply-workbench/DESIGN.md)定义前端使用的 Ant Design 组件和主题。

## 许可证

源码采用 [MIT 许可证](LICENSE)。
