# 本地运行手册

## 启动示例

进入 `supply-workbench/`。安装 Docker 和 Docker Compose 后构建应用并启动数据库。

```sh
docker compose -f docker/compose.yml build app
docker compose -f docker/compose.yml up -d --wait db
docker compose -f docker/compose.yml run --rm --no-deps -T --entrypoint node app --experimental-strip-types scripts/db-lifecycle.ts migrate
docker compose -f docker/compose.yml run --rm --no-deps -T --entrypoint node app --experimental-strip-types scripts/db-lifecycle.ts seed
docker compose -f docker/compose.yml up -d app
```

打开 `http://127.0.0.1:8080`。示例访问码是 `dev-code`。在登录页选择管理员或采购员，再从导入页上传[合成采购表](fixtures/synthetic/po-master-procurement.xlsx)。数据库和上传记录保存在本机 Docker 卷。

本地验证结束后，可用 `docker compose -f docker/compose.yml down` 停止服务。

## 验证

> 数据库写入验收使用单独的测试库。

在 `supply-workbench/` 运行 `pnpm verify` 检查类型、代码约定、测试和构建。浏览器验收和 GitHub Actions 见 [CI 说明](docs/ci-verification.md)。
