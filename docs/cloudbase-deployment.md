# CloudBase 部署说明

## 架构

推荐按单平台拆成两部分：

1. 前端静态资源部署到 CloudBase 静态网站托管
2. 在线联机后端部署到 CloudBase 云托管（CloudRun）

当前代码已经支持两种房间持久化驱动：

- `ROOM_STORE_DRIVER=file`
- `ROOM_STORE_DRIVER=cloudbase`

生产环境请使用 `cloudbase`，避免把房间状态写入容器本地文件。

## 必要环境变量

后端云托管服务：

```bash
NODE_ENV=production
PORT=3001
ROOM_STORE_DRIVER=cloudbase
CLOUDBASE_ENV_ID=your-env-id
CLOUDBASE_APIKEY=your-server-api-key
TCB_ENV_ID=your-env-id
TCB_API_KEY=your-server-api-key
CLOUDBASE_ROOM_COLLECTION=online_rooms
CORS_ORIGINS=https://zombie-catan-d8g07asiy5e3f05c1-1435101306.tcloudbaseapp.com,https://zombie-catan-d8g07asiy5e3f05c1-1435101306.ap-shanghai.app.tcloudbase.com
```

前端静态托管构建：

```bash
VITE_SOCKET_URL=https://<your-cloudrun-domain>
```

`CORS_ORIGINS` 必须填写前端实际访问域名。生产环境默认不会再放开所有来源，多个域名用英文逗号分隔，例如：

```bash
CORS_ORIGINS=https://game.example.com,https://zombie-catan.example.tcloudbaseapp.com
```

## 后端部署

1. 在 CloudBase 创建环境。
2. 在云托管中新建一个容器服务。
3. 使用仓库根目录的 [Dockerfile](/E:/Interview/Project4/Dockerfile) 构建镜像。
4. 为服务配置上面的环境变量。当前仓库里的 [Dockerfile](/E:/Interview/Project4/Dockerfile) 已经写入了当前环境的 `TCB_ENV_ID` 默认值，后续如果你切换到别的 CloudBase 环境，再在服务配置里覆盖它即可。
5. 部署完成后访问 `/health`，确认返回 `{"ok":true}`。
6. 记录云托管默认域名，供前端的 `VITE_SOCKET_URL` 使用。

对应 CLI 命令：

```bash
tcb cloudrun deploy -e <envId> -s zombie-catan-wasteland-api --port 3001 --source . --force
```

## 前端部署

1. 在静态网站托管中连接当前仓库，或直接上传 `dist`。
2. 构建命令使用：

```bash
npm run build:client
```

3. 输出目录使用：

```bash
dist
```

4. 在构建环境变量中设置 `VITE_SOCKET_URL` 指向后端云托管地址。

如果使用 CLI，可以直接在项目根目录执行：

```bash
tcb app deploy --framework vite -e <envId>
```

仓库已经包含 [cloudbaserc.json](/E:/Interview/Project4/cloudbaserc.json)，登录后也可以直接运行：

```bash
tcb app deploy
```

## 数据模型建议

文档数据库中至少保留一个集合：

- `online_rooms`：以 `roomCode` 作为文档 ID，保存房间快照、座位信息、重连令牌和最近命令

## 备案说明

如果你要绑定中国大陆自定义域名，需要先完成 ICP 备案。CloudBase 资源本身不能直接作为备案接入资源，通常需要先购买轻量应用服务器或 CVM 完成备案，再把域名绑定到 CloudBase。
