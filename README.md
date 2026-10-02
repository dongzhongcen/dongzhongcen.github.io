# dongzhongcen.github.io

我的个人博客：https://dongzhongcen.github.io（主题：[Chirpy](https://github.com/cotes2020/jekyll-theme-chirpy)）

## 怎么写一篇新日记

1. 打开仓库里的 `_posts` 文件夹，点 **Add file → Create new file**。
2. 文件名按 `年-月-日-英文或拼音标题.md` 来写，例如 `2026-10-03-learned-java-threads.md`。
3. 复制下面的模板，改好标题、日期和标签，在下面写正文：

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

4. 点 **Commit changes**，在仓库的 **Actions** 页面能看到发布进度，绿色对勾出现后网站就更新了（一般两三分钟）。

- 项目页每天早上 6 点左右会自动同步一次 GitHub 上的公开仓库，每次提交日记时也会同步。
- 想给文章加封面图：先把图片上传到 `assets/img`，再在模板的 `tags` 下面加两行：

  ```yaml
  image:
    path: /assets/img/图片文件名.jpg
  ```

- 每篇日记页面上有“编辑”链接，点进去就能直接在 GitHub 上修改。
