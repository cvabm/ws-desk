# ApiTester

一个基于 Wails + Go 的 Windows HTTP / WebSocket 接口管理与调试工具。

## 主要功能

- 文档模式：按项目和模块维护 HTTP 接口或 WebSocket 消息，无需先创建环境。
- 调试模式：选择环境后执行已保存的接口；环境只提供 `BASE_URL` 地址前缀和变量值。
- 支持 `http`、`https`、`ws`、`wss`，以及 Params、Headers、Auth、Body、重定向和 WebSocket subprotocol。
- 项目、环境和接口分层保存；每个环境只属于一个项目，同项目数据保存在一个 JSON 文件中。
- 支持接口目录导入导出、请求记录、会话日志和历史搜索。
- 每次启动默认进入文档模式。

## 数据目录

首次启动会要求选择数据文件夹，之后记住该位置。若记住的文件夹已不存在，会重新要求选择。

所选目录中包含：

- `connection-profiles/`：项目、环境和接口定义，一个项目一个 JSON 文件。
- `api-requests/`：HTTP / WebSocket 会话日志。

建议选择仓库和 `build/bin` 之外的目录，避免清理构建产物时误删。应用不会自动把该目录加入主仓库；是否提交由该目录自身的 Git 配置决定。

## 开发

需要 Go、Node.js、WebView2、Wails CLI，以及 Windows 上 Wails 构建所需的 GCC 环境。

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
wails dev
```

测试与构建：

```bash
go test ./...
cd frontend
npm test
npm run build
cd ..
wails build
```

产物位于 `build/bin/ApiTester.exe`。
