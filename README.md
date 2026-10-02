# dongzhongcen.github.io

<p align="center">
  <img alt="Jekyll" src="https://img.shields.io/badge/jekyll-4.x-cc0000">
  <img alt="Chirpy" src="https://img.shields.io/badge/theme-Chirpy%207.6-2a408e">
  <img alt="GitHub Pages" src="https://img.shields.io/badge/deploy-GitHub%20Pages-222222">
  <img alt="GitHub Actions" src="https://img.shields.io/badge/ci-GitHub%20Actions-2088ff">
  <img alt="Markdown" src="https://img.shields.io/badge/content-Markdown-000000">
</p>

这是我的个人博客 [dongzhongcen.github.io](https://dongzhongcen.github.io)，基于 Jekyll 和 [Chirpy](https://github.com/cotes2020/jekyll-theme-chirpy) 主题，部署在 GitHub Pages 上。博客主要用来写每天的学习日记和感想，同时有一个项目页，自动展示我在 GitHub 上的全部公开仓库。每次提交都会由 GitHub Actions 自动构建并发布，不需要服务器和数据库。

## 功能特性

- **学习日记**：每篇日记是 `_posts` 下的一个 Markdown 文件，支持代码高亮、一键复制代码、数学公式和 Mermaid 图。
- **分类与标签**：通过 `categories` 和 `tags` 归类，侧边栏有分类、标签、归档页，方便按主题复习。
- **项目页**：构建时通过 GitHub API 拉取全部公开仓库（`_data/repos.json`），按最近更新排序展示名称、描述、语言和 star 数；浏览器端再尝试实时刷新一次。
- **自动发布**：推送到 `main` 后由 `.github/workflows/pages-deploy.yml` 构建发布，每天北京时间 6:17 也会自动重建一次，保证项目页同步。
- **中文界面与深色模式**：`lang: zh-CN`，时区 `Asia/Shanghai`，支持浅色 / 深色切换和站内搜索。
- **在线编辑**：每篇文章页面有“编辑”链接，直接跳到 GitHub 上修改。

## 项目结构

```text
.
├── _config.yml                    # 站点配置（标题、头像、语言、时区等）
├── _posts/                        # 日记文章，文件名 YYYY-MM-DD-标题.md
├── _tabs/                         # 侧边栏页面：项目、分类、标签、归档、关于
│   └── projects.html              # 项目页（读取 _data/repos.json）
├── _data/
│   ├── repos.json                 # GitHub 公开仓库列表（构建时自动更新）
│   ├── contact.yml                # 侧边栏联系方式
│   └── share.yml                  # 文章分享按钮
├── _plugins/posts-lastmod-hook.rb # 根据 git 记录生成文章最后修改时间
├── assets/
│   ├── img/avatar.jpg             # 侧边栏头像
│   └── js/repos.js                # 项目页浏览器端刷新
├── .github/workflows/pages-deploy.yml  # 构建与发布流程
├── Gemfile                        # jekyll-theme-chirpy 依赖
└── index.html                     # 首页
```

## 快速开始

### 写一篇新日记

1. 打开 `_posts` 文件夹，点 **Add file → Create new file**。
2. 文件名按 `年-月-日-英文或拼音标题.md`，例如 `2026-10-03-learned-java-threads.md`。
3. 复制下面的模板，改好标题、日期和标签后写正文：

```markdown
---
title: "今天学了什么"
date: 2026-10-03 21:00:00 +0800
categories: [学习日记]
tags: [python, fastapi]
---

## 今天做了什么
一两句话说清楚。

## 学到的新概念
- 用自己的话解释，假装讲给一个没学过的朋友听

## 卡住的地方和怎么解决的
报错是什么、一开始以为是什么原因、最后发现真正的原因是什么。

## 还没想明白的问题

## 明天想做什么
```

4. 点 **Commit changes**，在 **Actions** 页面出现绿色对勾后网站就更新了（一般两三分钟）。

### 给文章加封面图

先把图片上传到 `assets/img`，再在文章开头的 `tags` 下面加两行：

```yaml
image:
  path: /assets/img/图片文件名.jpg
```

### 本地预览（可选）

```bash
bundle install
bundle exec jekyll serve
```

打开 `http://127.0.0.1:4000` 预览。

## 当前状态

博客已上线，主题为 Chirpy 7.6，目前有 1 篇日记。后续可继续完善：

- 补全各仓库的 GitHub 描述，让项目页的卡片都有说明
- 开启评论（Chirpy 支持 giscus，基于 GitHub Discussions）
- 按需添加访问统计（如 GoatCounter）
