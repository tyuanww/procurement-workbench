# 在本机运行工作台

## 启动工作台

安装 Docker 和 Docker Compose。进入仓库的 `supply-workbench/`，构建应用并启动数据库。

```sh
docker compose -f docker/compose.yml build app
docker compose -f docker/compose.yml up -d --wait db
docker compose -f docker/compose.yml run --rm --no-deps -T --entrypoint node app --experimental-strip-types scripts/db-lifecycle.ts migrate
docker compose -f docker/compose.yml run --rm --no-deps -T --entrypoint node app --experimental-strip-types scripts/db-lifecycle.ts seed
docker compose -f docker/compose.yml up -d app
```

## 导入示例采购表

打开 `http://127.0.0.1:8080`。在登录页选择管理员或采购员，输入示例访问码 `dev-code`。打开导入页并上传合成采购表。[合成采购表](fixtures/synthetic/po-master-procurement.xlsx)

数据库和上传记录保存在本机 Docker 卷。

## 停止工作台

在 `supply-workbench/` 运行 `docker compose -f docker/compose.yml down`。数据卷供下次启动继续使用。
