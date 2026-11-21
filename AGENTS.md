# dsh-vim 开发约定

这个仓库有两个检出，共用同一个 `.git`：

- `G:\桌面\dsh-vim` —— **live**。日常那个 DSH 应用的 `desktop` profile 直接 link 这里，
  它只接受 `git merge --ff-only`，不要在这个目录里改代码。
- `G:\桌面\dsh-vim-dev` —— **dev** worktree（分支 `dev`），所有开发在这里做。

验证：`node tools/selftest.mjs`（纯 Node、无端口，dev 和 live 各自可跑）。

发布：在 dev 里跑 `node tools/publish.mjs` —— 先跑 selftest，绿了才把 live 快进到 `dev`；
应用只在**启动时**读 `lib/client.js`，所以重启才看得到。

回滚：`git -C "G:\桌面\dsh-vim" reset --hard ORIG_HEAD`。

被要求直接在 live 目录改代码时先确认一次：那会让正在使用的看板在下次重启时变样。
