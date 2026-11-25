# 在本机运行工作台

## 启动工作台

从仓库的[本地试用](../README.md#本地试用)启动 `shinemage-demo`。下面的命令都在仓库的 `supply-workbench/` 目录执行。

## 检查服务

```sh
docker compose -p shinemage-demo -f docker/compose.yml ps
docker compose -p shinemage-demo -f docker/compose.yml logs --tail 80 app
curl -fsS http://127.0.0.1:8080/api/v1/health
```

服务就绪后，健康响应包含 `"ok":true` 和 `"db":"up"`。

## 导入示例采购表

按[导入一份样本](../README.md#导入一份样本)登录、导入并查看采购事项。

数据库和上传记录保存在本机 Docker 卷。

## 切换本机端口

如果 `8080` 已占用，把环境变量 `SUPPLY_DEV_PORT` 设为一个空闲端口，例如 `18080`。在每条 Compose 命令的 `-f docker/compose.yml` 后加 `-f docker/compose.local.yml`。该覆盖文件需要 Docker Compose 2.24.4 或更高版本。用新端口打开登录页和健康接口。 [Compose 端口覆盖规则](https://docs.docker.com/reference/compose-file/merge/#replace-value)

同一台机器同时运行多套环境时，为每套环境指定自己的 `-p` 项目名和端口。项目名不同的环境使用各自的数据库和上传卷。

### 总监首页的新品排期来源

服务端可用 `DEVELOPMENT_SCHEDULE_DIR` 指定受控的只读目录。每个品牌放一份以品牌名命名的工作簿，保留飞书导出的「开发中产品」工作表及首行字段。也可放该工作表的 UTF-8 CSV，同一品牌只放一个文件。容器运行时，把该目录只读挂载到配置的容器内路径。更新时在同一目录用完整文件原子替换，重新打开首页即可读到新排期。测试样表在 [合成新品排期](fixtures/synthetic/director-schedule/)。

业务页以最近一次生效的采购总表文件上传时间，按业务时区显示数据截止日。新品项目按「开发中产品」每个有产品名称的记录计数，按原表的项目对接人显示名汇总。同名人员需要在来源表使用可区分的显示名。未填对接人的项目单列为待分配，预计入仓的月份和文字约定保留原文。

## 停止工作台

```sh
docker compose -p shinemage-demo -f docker/compose.yml down
```

数据卷供下次启动继续使用。
