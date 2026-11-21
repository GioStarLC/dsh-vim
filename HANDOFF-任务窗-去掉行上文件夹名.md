# 任务窗：去掉行上重复的文件夹名

> 本文件是**待办**，不是已完成记录。交接给一个新计划接手。
> 写下时的仓库状态：`main` 分支、`864c633` 之后全部未提交、`node tools/selftest.mjs` = **279 checks passed**。
> 行号取自写入时刻的工作区。**若对不上，用函数名去找，不要信行号**——同一个 `lib/client.js`
> 里还混着另一条改动流（见第 6 节），行号会漂。

---

## 0. 一句话

任务窗（F 弹窗）已经把"今天的对话按文件夹分组"做完了，块标题行上写着文件夹名。
现在要去掉**每一行行首那格重复的文件夹标签**，只保留块标题那一处。

---

## 1. 背景：上一轮已经做完的部分

**已实现并有测试覆盖**，接手的人不要重做：

| 能力 | 代码位置 | 用例（`tools/selftest.mjs`） |
|---|---|---|
| 候选池按「工作区序 × 组内最近使用」排，**去掉了** `pinHere` | `conversationPool` `sortByRecency` `folderItems` | `today is cut into one block per folder, in the registry order` |
| 当前会话**不再被搬到第一行**，改成开窗时选中它 | `hereIndex`（`openPalette` / `refreshPalette` 调用） | `the window opens with the selection on the conversation on screen`、`opening the window does not reorder a folder for the row you are in` |
| 切对话不重排列表 | 同上 | `switching conversations never reorders the list` |
| 12h 界线切成"今天块"与"更多块"，当前会话被拉回但**留在原位** | `paletteBlocks` | `a conversation pulled into today lands in its own folder, not on the end`、`the conversation on screen is loaded even when it is outside the window` |
| 分块：每文件夹一块 + 未分组一块 + 更多一块 | `paletteSections` `rebuildRows` | `a folder with nothing in today does not appear at all`、`the conversations no folder accounts for follow the folders`、`the task window reports its own blocks to the console` |
| 表头行不可选中（`d`/`e` 跳过、点击无效） | `buildSectionHeader` | `a heading is not a row: it is never selectable`、`a press on a heading switches nothing and moves nothing` |
| `更多` 标题带"还压着多少条" | `paletteSections` | `the More heading says how much is behind it` |
| 调试 API 暴露 `sections[]` | `makeApi` 的 `palette()` | 同上 |

**验证状态（写入时刻）**

```
node --check lib/client.js            → 0
node tools/selftest.mjs               → 279 checks passed
node .agent/dead-fn.mjs lib/client.js → 195 declared / 0 unreferenced
```

**上一轮刻意没做的一件事**：当时的口头决定是"行首那格文件夹标签**先留着**，体验之后再说"。
那"之后"就是本文件。当时 `README.md` 的「已知限制」和升级表 0.18.x 里写着这个待办状态；
现在版本历史归 `CHANGELOG.md`，改完记在那里即可。

---

## 2. 本轮已拍板的三条（不要再问）

| # | 决定 |
|---|---|
| 1 | **`更多` 块里的行继续画文件夹名。** 它上方只有一个"更多"标题，没有替它说明任何一条对话属于谁。 |
| 2 | **不加 `title` 悬浮提示。** 去掉行上文件夹名后，原来那条 `title="G:\桌面\dsh-vim"` 一并没了，不补。 |
| 3 | **不能接受对话名 x 位置跳动。** 揭示 `更多` 的那一刻，已在屏幕上的行整体右移，这件事必须避免。 |

---

## 3. 还没拍板的（动手前必须先定）

1. **路线甲还是路线乙**（第 4 节详述）。我建议乙。
2. **`更多` 里那行文件夹名用什么样式**：胶囊（带底色的小块）还是纯文字前缀（淡灰 + 间隔）。
   我倾向**纯文字**——一屏几十个胶囊太花。
3. **分组标题行要不要相对提亮。** 行上那格拿掉之后，标题行是这块唯一的归属说明。
   它现在是弱样式（淡灰、小字、全大写字距，`PALETTE_UI.sectionHeader`）。
   要不要比现在明显一点，让"这若干行属于这个文件夹"一眼成立？

---

## 4. 技术方案

### 4.1 跳动的根因（这是 3 的技术约束，不是偏好）

文件夹列的宽度是**量当前渲染出来的格子**得到的：

```
fitColumns → widestCell(PALETTE.columns.folder)
              ├─ 开窗时：今天块都不画 → 量到 0 → 列宽 '0' → 名字顶到最左
              └─ 按 d 后：更多块画了 → 量到最长名 → 列宽 Npx → 所有行整体右移 N
```

**"列宽随内容变化"本身就是跳动。** 要稳住 x，只有两条路：要么列宽永远固定（预留空间），
要么根本没有列。

### 4.2 路线甲：保留列，预留固定宽度

把量宽度的对象从"画出来的格子"改成"可能出现的文件夹名"（直接从 `workspaces` 注册表量）。

- 今天块：空格子（正是需求里说的"展示空"）
- `更多` 块：有名字
- x 不动 ✓
- **代价**：常年占着一条可能空着的横栏；而且某个文件夹名很长、今天又没对话时，
  **照样为它腾位置**——为一个不在屏幕上的东西付钱。

### 4.3 路线乙（推荐）：取消该列，改成内联前缀

`更多` 的行把文件夹名画成**对话名前面的一小段**（像模型窗现在给 `当前` 徽标的做法），
其余行什么都不画。没有列 → 没有列宽 → 没有东西能跳。

- 今天块：无 ✓　`更多` 块：名字前带文件夹 ✓　x 不动 ✓
- **代价**：完全不浪费空间；`更多` 里那些行的标题文字会比上面几块缩进深一点

**推荐乙的三个理由**

1. 同一个仓库里已有先例。模型窗在 0.17.1 就这么改过，`buildModelRow` 旁的注释写着：
   「标签不再单独占一列：那条为对齐而留的空栏，每一行都在为它付宽度，而这么短的列表里
   这点对齐不值这个钱。」
2. 路线甲省下的信息与付出的空间不成比例。
3. 说清一个区别：用户拒绝的是"**已在屏幕上的行**整体跳一下"。路线乙里，上面几块
   **一个像素都不动**，只有新展开的 `更多` 行标题前多一小段文字。

### 4.4 路线乙的连带改动（唯一有技术含量的部分）

列消失 → grid 列号整体前移一位：

| | 现在 | 改后 |
|---|---|---|
| 文件夹 | 第 1 列 | 没了 |
| 对话名 | 第 2 列 | **第 1 列** |
| `当前` 标签 | 第 3 列 /（无标签时）2 | **第 2 列 / 1** |
| 阶段 / 状态 / 轮数 / 时间 | 第 4~7 列 | **第 3~6 列** |

具体三处：

1. `PALETTE_UI.title` 与 `PALETTE_UI.renameInput` 的 `gridColumn: '2'` → `'1'`
2. `columnOf(name)` 里的基准 `+ 3` → `+ 2`
   （`SIDE_COLUMIONS` 顺序不变，`hereOn` 为假时仍是 `base - 1`）
3. `rowColumns()` 去掉 `tracks.folder` 这一段拼进模板

连带可清掉的死物：`PALETTE_FOLDER_SHARE`、`PALETTE_UI.folder`、
`PALETTE.columns.folder`、`PALETTE.tracks.folder`、`fitColumns` 里量 folder 的那段。
清不清都行，但清了要确认 `resetPaintScratch()` 里两处 `PALETTE` 初始值同步改。

**必须补一条钉死列号的用例**：断言"对话名落在第 1 列、`当前` 标签落在第 2 列"，
防止以后再加列时错位。这是这次改动唯一容易悄悄坏掉的地方。

---

## 5. 测试影响清单

**要重写（它们断言的正是要取消的东西）**

- `every row shows the folder its conversation lives in`
- `folder names and conversation names each share one left edge`
- `the folder column is only as wide as the names on screen`

**会自然失效但要确认改对了的**

- `rightTracks(row)` 辅助函数（`tools/selftest.mjs`）按 `' minmax(0, 1fr) '` 切模板，
  列少一列后切分点变了，多条断言右侧列数的地方要复核。

**不受影响（已核对过）**

- `a host without a workspace registry still lists conversations`
- `the conversations no folder accounts for follow the folders`

**要新增**

- 列号钉死用例（第 4.4 节）
- 走路线乙时，再加一条："今天块的行行首没有文件夹格，`更多` 块的行有"。

**辅助函数现状**（`tools/selftest.mjs`）已经能区分行与表头，别重复造：

- `listNodes()` —— 列表里所有元素
- `rowNodes()` —— 只返回行（按有无 `data-session-id` 过滤）
- `sectionHeaders()` / `sectionNames()` —— 表头

---

## 6. 必须遵守的坑

1. **`lib/client.js` 里混着另一条改动流。** 模型选择窗（`w`）的档位列表重写是另一路人做的，
   和任务窗分组这条线**在同一个未提交的工作区里**。提交时用 `git add -p` 分开，
   否则两半互相掩盖，出了问题没人分得清是谁的。
2. **写代码期间这个文件被并发改过多次**（`tools/selftest.mjs` 一度在我读它的过程中持续增长）。
   动手前先确认稳定：
   ```
   Get-Item lib/client.js; Start-Sleep 20; Get-Item lib/client.js
   ```
   大小和 mtime 都不变再开始。
3. **单文件、无构建、无 import seam**，靠函数提升。`REFACTOR-NOTES.md` 记过一次教训：
   新增函数前必须全仓搜同名符号，否则会静默遮盖既有实现。
   现有符号：`paletteSections` `rebuildRows` `hereIndex` `paletteBlocks` `buildSectionHeader`
   `sortByRecency` `folderItems` —— 都已占用，勿重名。
4. **全部验证都基于假 DOM**（`tools/selftest.mjs`）。视觉上文件夹名前缀的观感、
   淡灰文字在明暗主题下的对比度，只有真机能确认。

---

## 7. 完成判据

- [ ] `node --check lib/client.js` → 0
- [ ] `node tools/selftest.mjs` → 全绿（基线 **279**，新用例数要高于 279）
- [ ] `node .agent/dead-fn.mjs lib/client.js` → `never referenced : 0`
- [ ] 死物清理干净（第 4.4 节），无残留引用
- [ ] 行为变化写进 `CHANGELOG.md` 的 `0.18.0` 下（`README.md` 不再维护版本历史）
- [ ] `package.json` / `dsh.plugin.json` 若动了行为，同步版本
- [ ] **真机看一次**：揭示 `更多` 前后，已在屏幕上的行不能有任何位移

---

## 8. 当前仓库状态（写入时刻）

```
分支      main
HEAD      864c633 chore: initial commit（之后全部未提交）
未提交    README.md  dsh.plugin.json  lib/client.js  package.json  tools/selftest.mjs
版本      0.18.0（已改，未提交）
测试      279 checks passed
```

`dsh-vim/.agent/dead-fn.mjs` 是这次新加的死代码扫描脚本（未提交）。
`dsh-vim/.agent/baseline/` 与 `.agent/iso/` 是排查用的临时副本，**可以删**。