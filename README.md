# ws-desk

极简 Windows WebSocket 调试桌面端（Wails + Go）。

## 功能

- 连接 / 断开，支持 subprotocol、自动重连、WebSocket ping
- 多行发送、JSON 格式化、重发上一条（`Ctrl+Enter` 发送）
- 消息列表 + 详情；**默认浅色**，可一键切深色（本地记住）
- Profile 下拉切换（默认 `imcp` / `gateway`）
- 会话日志：**一天一个文件** `ws-logs/ws-YYYY-MM-DD.jsonl`（当天多次连接追加写入）
- **历史**：按天浏览 / 关键字搜索 jsonl，可返回实时

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
# 产物: build/bin/ws-desk.exe
```

运行时会在 exe 同目录（或项目目录）使用：

- `profiles/` 连接配置
- `ws-logs/` 会话日志

## 旧脚本

仓库根目录的 `ws-imcp.js` / `ws-gateway.js` 仍可作命令行备用。
