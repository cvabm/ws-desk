# ApiTester

极简 Windows WebSocket / HTTP 调试桌面端（Wails + Go）。

产物：`ApiTester.exe`。

## 功能

- 支持 **ws / wss / http / https**
- WebSocket：连接 / 断开、subprotocol、自动重连、ping；发送时未连接则自动连接
- HTTP/HTTPS：无需连接；Params / Headers / Auth / Body，发送后看状态码、耗时、请求头、响应头和响应体（自签证书可连）
- **手动记录**：HTTP 在「响应」页填写状态/头/体；WebSocket 在底部「发送 / 返回」各填一侧。点「记录」即可保存（不发网络请求），写入当天日志，可在历史里检索
- 多行发送、JSON 格式化、重发上一条（`Ctrl+Enter` 发送）
- 消息列表 + 详情；**默认浅色**，可一键切深色（本地记住）
- URL 自己带协议（`ws://` / `wss://` / `http://` / `https://`）；Profile 按 **协议 + IP/域名** 分开保存，下拉切换
- 会话日志：按 **日期 + IP/域名** 分文件 `requests/ws-YYYY-MM-DD-host.jsonl`
- **历史**：按天和主机浏览 / 关键字搜索 jsonl，可返回实时

## 开发

```bash
# 需要: Go 1.25+、Node、WebView2、gcc(MSYS2)
go install github.com/wailsapp/wails/v2/cmd/wails@latest

cd ws-desk
wails dev
```

## 打包单文件

```bash
cd ws-desk
wails build
# 产物: build/bin/ApiTester.exe
```

运行时会在 exe 同目录（或项目目录）使用：

- `servers/` 连接配置
- `requests/` 会话日志

## 旧脚本

仓库根目录的 `ws-imcp.js` / `ws-gateway.js` 仍可作命令行备用。
