# 第三方组件

Windows 下载包的 `licenses/` 目录收录构建时 Go 工具链及 Go 模块缓存中的顶层 LICENSE、COPYING、NOTICE 文件。各组件仍受各自许可约束；收录模块不表示 Windows 程序使用其所有平台的代码。

主要组件：

- [Go](https://go.dev/)：BSD 风格许可，见 `Go-LICENSE.txt`。
- [Wails v2](https://github.com/wailsapp/wails)：MIT。
- [Gorilla WebSocket](https://github.com/gorilla/websocket)：BSD-2-Clause。
- Nunito 字体：Copyright 2016 The Nunito Project Authors (contact@sansoxygen.com)，SIL Open Font License 1.1。
- IBM Plex Mono 字体：Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"，SIL Open Font License 1.1。原始许可见 [Google Fonts 的 OFL.txt](https://github.com/google/fonts/blob/main/ofl/ibmplexmono/OFL.txt)。

上述字体的 SIL Open Font License 1.1 全文见下载包 `licenses/fonts-OFL.txt`，源码中位于 `frontend/src/assets/fonts/OFL.txt`。

Microsoft Edge WebView2 Runtime 是单独安装的运行环境，不包含在此下载包中。项目自身代码的开源许可尚未指定；第三方许可不会自动授予本项目代码的使用许可。
