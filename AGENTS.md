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

文档：`README.md` 只讲怎么用（键位、设置、安装、结构、开发、已知限制），不写版本历史；`CHANGELOG.md` 只记行为变化，一句话一条。改了 `lib/client.js` 行为时同步 `package.json` 与 `dsh.plugin.json` 的版本号。

历史：`dev` 分支停在 64512e7，是两检出时代留下的；`wip/board-0.48.1-carry`（73c7884）
收着一份从 dev 工作区原样救下的 0.48.1 想法卡改动（README / client.js / selftest 三件
一套，未验证），要用就 `git cherry-pick 73c7884`。

## 导航：先查 MAP，再读代码

`lib/client.js` 两万行，找入口的方式只有一种：

- `MAP.md` —— 每个顶层函数一行，带行号和上方注释首句。**按名字查行号，再读那一段**，
  不要从头读。
- `npm run map` —— 改完代码重新生成；`MAP.md` 不手改。

`tools/selftest.mjs` 同理：先 `grep -n "await check(" tools/selftest.mjs` 定位那条用例，
再读它附近，不要整份读。

## 门禁：pre-commit 跑全套

`.githooks/pre-commit`（`git config core.hooksPath .githooks`）在提交前跑 `node --check`
加 `node tools/selftest.mjs`，约 3 秒。`npm test` 与钩子等价，手工验证用它。

- 红的基线不许提交上来。
- 只有在检查本身待修时才可以 `--no-verify`，并在提交信息里写明原因。

## .agent 是临时区，不进仓库视野

`.agent/` 已被 gitignore，但文件工具（glob / grep）**照样看得见**：它现在是四百多个文件、
近三十兆，每次列目录都在稀释结果。规则：

- 日志和一次性探针用完即删，不要在 `.agent/audit`、`.agent/probe` 这类目录里过夜。
- 需要长期保留的东西放进 `tools/`，不要放 `.agent/`。

