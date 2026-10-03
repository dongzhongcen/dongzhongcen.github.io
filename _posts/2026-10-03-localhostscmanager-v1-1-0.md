---
title: "localhostSCmanager v1.1.0 更新公告"
date: 2026-10-03 23:55:00 +0800
categories: [公告]
tags: [公告]
---

我的 Windows 本地服务管理小工具 localhostSCmanager 发布了 v1.1.0。这一版的重点是<span style="color:#e03131">双击 exe 就能用，不用再装 Node.js、敲命令</span>。

- 下载：[v1.1.0 Release 页面](https://github.com/dongzhongcen/localhostSCmanager/releases/tag/v1.1.0)（`ServiceManager-v1.1.0-win-x64.zip`）
- 仓库：[dongzhongcen/localhostSCmanager](https://github.com/dongzhongcen/localhostSCmanager)
- 完整改动：[CHANGELOG.md](https://github.com/dongzhongcen/localhostSCmanager/blob/main/CHANGELOG.md)

## 怎么用

1. 到 [Release 页面](https://github.com/dongzhongcen/localhostSCmanager/releases/tag/v1.1.0) 下载 `ServiceManager-v1.1.0-win-x64.zip`。
2. 解压到任意目录，比如 `D:\Tools\ServiceManager\`。
3. 双击 `ServiceManager.exe`，几秒后浏览器会自动打开管理界面（默认 http://localhost:3000 ，端口被占用时自动换成 3001～3010）。

<span style="color:#e03131">exe 没有签名，第一次运行时 Windows SmartScreen 可能会拦截，点“更多信息”，再点“仍要运行”即可。</span>

`runtime` 和 `app` 文件夹要和 `ServiceManager.exe` 放在一起，不要只拷贝 exe。

## 新增

- **`ServiceManager.exe` 免安装版**：自带 Node 运行环境，后台运行，不弹命令行窗口。exe 由 GitHub Actions 在 Windows 上自动构建、冒烟测试并发布。
- **系统托盘图标**：右键菜单可以打开管理界面、查看运行日志、退出（退出时停止所有服务）。再次双击 exe 不会重复启动，只会打开管理界面。
- **日志标注**：每行日志带时间和标签，如 `[2026-10-03 21:55:01] [STDOUT] ...`，标签分为 `INFO` / `STDOUT` / `STDERR` / `ERROR`，界面里按标签着色、可以筛选。<span style="color:#e03131">中文 Windows 上的 GBK 输出会自动转码，不再乱码。</span>
- **更新公告**：界面右上角显示版本号，升级后第一次打开会自动弹出更新公告。

## 修复

- <span style="color:#e03131">停止服务后 `mysqld.exe`、`redis-server.exe`、`nginx.exe` 还在后台运行</span>：之前只结束了外层的 `cmd.exe`，现在会结束整个进程树。
- 主动停止服务后状态显示“错误”：现在主动停止记为“已停止”，只有异常退出才记为“错误”，并在日志里写明退出码。
- 命令里带空格的路径（如 `"C:\Program Files\Redis\redis-server.exe"`）无法启动。
- 数据库和日志的位置跟着启动目录走，换个目录启动就像丢了配置：exe 版现在固定放在程序目录下的 `data\`。

## 安全

<span style="color:#e03131">管理界面默认只监听 `127.0.0.1`。</span>之前监听所有网卡，同一局域网里的人也能打开界面、添加并运行任意命令。

## 注意事项

- <span style="color:#e03131">以管理员权限启动的服务，退出管理器后仍会继续运行</span>，需要先在界面里点“停止”。这类服务的日志也是原样写入，没有时间和标签。
- 从 v1.0.0 升级：把旧版的 `service-manager\app\data` 文件夹复制到新版 `ServiceManager.exe` 旁边，原来的服务配置就都还在。

**总结**：v1.1.0 改成了双击 exe 启动、带托盘图标，停止服务更干净，日志更好读，默认也只允许本机访问。有问题欢迎到仓库提 [Issue](https://github.com/dongzhongcen/localhostSCmanager/issues)。
