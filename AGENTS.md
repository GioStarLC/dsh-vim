# dsh-vim 开发约定

这个仓库只有一个检出：`G:\桌面\dsh-vim`，分支 `main`。日常那个 DSH 应用的 `desktop`
profile 直接 link 这里，所以这里跑的就是你看的看板。

开发：直接改。验证 `node tools/selftest.mjs`（纯 Node、无端口）。想确认它不会再吃爆堆，
加 `--max-old-space-size=256` —— 虚拟时钟跨一天是按下一次定时器跳过去的，不再按 16 ms
一片走完 540 万片。

生效：应用只在**启动时**读 `lib/client.js`，所以重启才看得到改动；改文件本身不影响正在
运行的进程。

回滚：`git reset --hard HEAD~1`，或 `git revert` 掉某个提交。

发布：没有单独的发布步骤，提交到 `main` 就是发布。`tools/publish.mjs` 是两检出时代的
遗留脚本，它检测到自己在 live 上就会直接报错退出，忽略即可。

历史：`dev` 分支停在 64512e7，是两检出时代留下的；`wip/board-0.48.1-carry`（73c7884）
收着一份从 dev 工作区原样救下的 0.48.1 想法卡改动（README / client.js / selftest 三件
一套，未验证），要用就 `git cherry-pick 73c7884`。
