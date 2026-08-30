# linjiang-dev —— 临江玻璃状态栏的测试镜像

这个仓库不是源头。源头是 [`linjiang-glass`](https://github.com/tangquanghuy/linjiang-glass)，
这里放的是它 `dev` 分支的快照，**只为真机验证存在**。

## 它解决的问题

状态栏是两半各自部署的：

| | 部署方式 | 生效时机 |
|---|---|---|
| **壳层** `外部部署/V20260826/状态栏-*.html` | 复制粘贴进角色卡 | 粘下去立刻生效，跟 git 无关 |
| **HUD** `src/*` 的构建产物 | GitHub Pages | 只从 `main` 构建 |

于是想在手机 / 模拟器上验 HUD 侧的改动（视觉性能档、贴图、设置页），以前只有两条路：合并到
生产的 `main`（等于对所有玩家上线），或者把 HUD 指到本机（要和手机同网段，反复用很别扭）。

这个仓库是第三条路。它的 Pages 地址是一个稳定的公网 HUD 地址：

```
https://tangquanghuy.github.io/linjiang-dev/
```

把它填进壳层的 `HUD_URL`，粘一次就能一直用来验。生产的 Pages 和 jsDelivr 一个字节都不受影响。

## 怎么用

1. **首次**：在本仓库 Settings → Pages 里把 Source 设成 **GitHub Actions**（只需做一次）。
2. 生成一份指向这里的测试壳层：在 `linjiang-glass` 仓库里跑
   `node scripts/make-preview-shell.mjs`，产物在 `artifacts/preview/`。
3. 把那份 HTML 整份粘进**测试角色卡**的「状态栏」，重开对话。
4. 之后每次要更新预览：在 `linjiang-glass` 里跑 `node scripts/publish-hud-preview.mjs`，
   它会把当前 `dev` 的快照推到这里，Actions 自动构建部署。壳层不用重新粘 —— 除非壳层本身
   也改了。

## 怎么确认手机上跑的是哪一版

状态栏 →（右下角齿轮）全局设置 → 拉到底，有一行小字：

```
HUD <git 短 sha>     壳层 <SHELL_VERSION>     原生流 / 抬升
```

- 第一段告诉你 HUD 是哪次构建；
- 第二段告诉你壳层是哪一版（这是最容易搞错的一半，因为它冻结在你粘贴那天）；
- 第三段告诉你走的是哪套架构 —— 移动端应该是「原生流」，如果显示「抬升」，说明架构判定没
  命中，那一半性能改动都没生效。

## 与生产的差别

只有一处：这里不 purge 任何 CDN 缓存（本仓库没有走 jsDelivr 的壳层脚本）。构建同样开
`ASSET_CDN=1`，素材仍然走 `linjiang-glass@main` 上那份 —— 这一点是刻意的，见
`.github/workflows/pages.yml` 里的说明：素材走 Pages 在国内会慢到几分钟，让预览站自己扛素材
会把一份生产根本不存在的下载等待掺进测量里。

## 注意

- **不要从这个仓库往生产提交**。它是单向的快照，历史会被 force push 覆盖。
- 这里的代码可能包含还没验证的改动，别拿它当参考实现。
