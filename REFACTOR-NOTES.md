# dsh-vim 重构笔记

本文件记录 2026-10-10 那次「任务窗收敛」尝试的真实结论，供后续重构参考。

## 状态（2026-10-10 收尾）

基线 3845 行 / 157 checks 全绿。当前 4033 行 / 161 checks 全绿 / 零死代码 / 零字段泄漏。

已抽出三个密封 module：**TURNS**、**RUNS**、**TOAST**。
三者字段引用全部收进各自的 factory，外部只能通过方法访问。

| 对象 | 原外部引用 | 现泄漏 | 接口 |
|---|---|---|---|
| `TURNS` | 19 | 0 | `read` `pending` `owe` `drain` `watch` `release` |
| `RUNS` | 25 | 0 | `note` `sync` `watching` `arm` `load` `keep` `drop` `adopt` `since` `release` `forget` |
| `TOAST` | 17 | 0 | `say` `place` `hide` |

**Candidate 1 仍未完成**：`PALETTE` 仍是 130 处引用的 god-object，任务窗 lifecycle、
列测量、row DOM、renaming 四个 concern 还混在一起；`makeApi` 仍是 9 个成员。

## 已落地（2026-10-10）

### 0. 三个密封 module（见上表）

挑选标准：先看「有没有 Seam」（外部触碰点是否集中），再看「有没有测试兜底」。
TURNS / RUNS / TOAST 三者都满足： neither 外部直接改字段，且 selftest 有专门用例
（peek 5 项、run clock 10 项、toast 10 项）。

每抽一个都单独跑一次 `node tools/selftest.mjs`，确认 157 不变。

### 1. `resetPaintScratch()` — 消除字段复位重复

`lib/client.js` 中 `renderPalette` 与 `closePalette` 曾逐字重复 4 行复位语句
（原 2525–2528 与 2721–2724）。现抽出为 `resetPaintScratch()`，两处共用。

- 复位点由 2 处降到 1 处
- 157 checks 全绿，无死代码
- 这是「手工 teardown」问题的最小修复，未改变任何行为

### 2. 文案字典 key 校验自动化

`tools/selftest.mjs` 中原先手工列出 34 个字典 key 做存在性断言。
任一侧漏一个 key 时翻译器会静默回退成裸 key，所以遗漏会直接上线。

现改为：先断言 zh/en 两组 key 完全相同（`deepEqual`），再断言全部非空；
原先那 34 个保留为「必须仍然存在」的额外断言。

- 覆盖：34 个手工列举 → 全部 75 个
- 已验证能抓到「只加在 ZH 一侧」的漂移

## 未落地 —— 关于第三章僚 Say more 的结论

试图把任务窗抽成独立的深 module（`makeRunLedger` / `makeTurnLedger` / `makeTaskWindow`）
并给出 `deps` 读取面。这一版**已回滚**，原因如下：

1. 抽出的三个 factory 无人调用 —— 只是把形状画出来了，行为一行没改
2. 反而新增了第二份 teardown 副本（`eraseTaskWindow`），即我在报告里批评的那个问题
3. `readSnapshot(deps, service, call, args)` 依赖尚不存在的 `deps.services` 形状
4. `readTaskWindowState` 里的 `isErased` 是凭空发明的概念，代码库里不存在

**测试的绿色不代表改动生效**：那 157 个 check 之所以全绿，正是因为没有任何调用点碰到新代码。
在一个 3845 行单 closure、无 import seam 的文件里，这是最容易踩的陷阱。

## 结构性约束（写之前必须知道）

- **不能拆文件**：`README.md` 的「结构」一节明确「没有构建步骤，`lib/` 是手写的、可直接运行的 JS」。
  仓库唯一的 `require()` 是 `require('react')`。所谓「拆 module」只能是同一个文件内的 closure，
  封装来自作用域而非文件名。
- **无版本控制**：仓库没有 `.git`。任何重构前请先手工备份（见 `.refactor-backup/`）。
- **函数提升会造成静默遮盖**：曾新增 `clampNumber(value, min, max)`，与 preferences 区既有的
  `clampNumber(value, spec, fallback)`（第 400 行）同名并因提升而胜出，导致所有数值型 preference
  失效（`0 !== 140`）。**在同一个 closure 里新增函数前，必须全仓搜索同名符号。**
- **并行改写同一 region 不可行**：两个任务都写 `lib/client.js` 的 1081–2793 行区间，
  没有 git 就没有冲突解决手段，而 green 的测试会让不一致悄悄留下。

## 下次继续时的建议顺序

按「能被现有 157 个 check 证明」的标准来做，一次一步：

1. 先给尚未被覆盖的行为补测试（例如三个速度 slider 目前零覆盖）
2. 再做纯搬迁型（无行为变化）抽取，每一步跑一次 selftest
3. 每一步结束确认无新增死代码
4. 涉及共享状态时，先确认写入点全集（如 `focusRequest` 被三个分区写）

## 环境事实

- Node v24.19.0
- 基线：`node tools/selftest.mjs` → `selftest: 157 checks passed`
- 语法检查：`node --check lib/client.js`
- 备份位置：`.refactor-backup/client.js.<timestamp>.bak`
