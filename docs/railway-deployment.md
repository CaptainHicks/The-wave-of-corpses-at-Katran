# Railway 部署说明

## 本地联调

```bash
npm install
npm run dev:online
```

说明：

- 前端运行在 `http://127.0.0.1:5173`
- Socket / Express 服务运行在 `http://127.0.0.1:3001`
- `.env.online` 会把前端联机模式指向本地 Socket 服务

## Railway 上线

1. 在 Railway 创建一个 Node.js Service，并连接当前仓库。
2. 为该 Service 挂载一个 Volume，推荐挂载到 `/app/data`。
3. 保持默认的 `railway.json` 配置，Railway 会执行：

```bash
npm run build
npm run start
```

4. 健康检查路径使用 `/health`。

## 房间持久化

- 默认房间快照目录：`<volume>/rooms`
- 如果 Volume 不是挂载到 `/app/data`，请额外设置环境变量：

```bash
ROOMS_DATA_DIR=/your/volume/path
```

服务会在这个目录下持久化：

- 房间大厅状态
- 对局快照
- `sessionToken` 重连令牌
- 最近一次命令与最后活跃时间

## 原版音频

- 线上服务会优先从 `<volume>/audio` 读取音频文件。
- 这样代码部署包可以保持精简，而原版音频可以单独同步到 Volume。
- 目录结构需要与本地 `public/assets/audio` 一致，也就是：

```text
<volume>/audio/music/*
<volume>/audio/sfx/*
```
