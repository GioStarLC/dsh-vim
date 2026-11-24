# MAP - src/client

由 `npm run map` 生成，不要手改。找一个功能的入口：先在这里按名字查到文件与行号，再读那一段。

源码：`src/client/`，1 个文件，513 个顶层函数。

| 文件 | 行 | 函数 | 上方注释 |
|---|---:|---|---|
| src/client/index.js | 1413 | localeIsZh | Best-effort locale guess, used for the nav label and fallback strings. |
| src/client/index.js | 1437 | defaults | Shipped defaults as a fresh object, derived from DEFAULTS so a new |
| src/client/index.js | 1447 | copy | Current preferences as a fresh object. |
| src/client/index.js | 1471 | isBindableKey | A single printable character, or one of `NAMED_KEYS`, is the only thing |
| src/client/index.js | 1487 | normalizeKey | Normalise a bound key to its stored form: lower case for characters, |
| src/client/index.js | 1503 | keyLabel | How a bound key reads in the settings box. A space is invisible in a box |
| src/client/index.js | 1510 | clampNumber | Clamp a numeric preference to its accepted range. |
| src/client/index.js | 1526 | sanitizeFavorites | The switchable models as a fresh list of `{provider, model}` pairs. |
| src/client/index.js | 1545 | persist | Persist the current preferences; storage failures are not fatal. |
| src/client/index.js | 1554 | announce | Notify the settings page that preferences changed. |
| src/client/index.js | 1569 | applyPatch | Validate and apply one patch. Rejected patches leave preferences intact. |
| src/client/index.js | 1643 | firstFree | The preferred key when it is free, else the first free letter. |
| src/client/index.js | 1663 | repairKeys | Force each key group to be conflict-free. Groups are repaired back to |
| src/client/index.js | 1727 | migrateArchiveSeat | Move the archive seat into place for a store written before it existed. |
| src/client/index.js | 1743 | load | Read stored preferences over the defaults. |
| src/client/index.js | 1796 | setStage | Mark one conversation, or take the mark off it, and repaint. |
| src/client/index.js | 1813 | stageHandler | The press handler for one stage word on one row. |
| src/client/index.js | 1830 | cyclePhase | Advance one conversation to the next stage, and repaint the window. |
| src/client/index.js | 1841 | subscribe | Subscribe to preference changes. |
| src/client/index.js | 1878 | isEditable | True when the element consumes printable characters itself. |
| src/client/index.js | 1892 | isScrollable | True when the element is a non-editable box that overflows vertically and |
| src/client/index.js | 1905 | parentOf | Parent element, crossing shadow boundaries through the host node. |
| src/client/index.js | 1916 | scrollerFrom | Nearest scrollable ancestor, inclusive. |
| src/client/index.js | 1926 | largestScroller | Largest visible scroll container; the last-resort target. |
| src/client/index.js | 1949 | elementAt | The topmost element at a point, when the document can be asked. A host |
| src/client/index.js | 1970 | pickScroller | Choose the container to scroll. Deterministic order: whatever sits under |
| src/client/index.js | 1994 | canMove | Whether the container still has room in the requested direction. |
| src/client/index.js | 2006 | resolveTarget | Walk from the picked container up to the first one that can move. This is |
| src/client/index.js | 2016 | reducedMotion | Honour the OS "reduce motion" preference. |
| src/client/index.js | 2026 | suppressSmooth | Pin `scroll-behavior: auto` for the animated element. Without this, a |
| src/client/index.js | 2035 | stopAnim | Stop the animation loop and restore anything it changed. |
| src/client/index.js | 2052 | frame | One animation frame: ease `current` toward `target`, frame-rate |
| src/client/index.js | 2078 | push | Queue a scroll step. Resolves (or reuses) the container, extends the |
| src/client/index.js | 2105 | stopHold | Cancel the held-key auto-repeat. |
| src/client/index.js | 2117 | tickHold | Auto-repeat tick: one more step, then schedule the next sooner. |
| src/client/index.js | 2138 | startHold | Start a hold: one immediate step, then our own accelerating repeat. The |
| src/client/index.js | 2155 | directionOf | Which direction a pressed key drives, if any. |
| src/client/index.js | 2170 | onKeyDown | Capture-phase key handler. Runs before the app's own handlers so the |
| src/client/index.js | 2580 | onKeyUp | Any keyup ends the hold, so a dropped keyup cannot leave the view scrolling. |
| src/client/index.js | 2606 | onEscapeBlur | Escape leaves a focused composer, so the scroll keys come back. |
| src/client/index.js | 2631 | onPointerMove | Remember where the pointer is. |
| src/client/index.js | 2652 | forgetPointer | Forget the remembered pointer, so the focus and centre rules decide again. |
| src/client/index.js | 2657 | onUserScroll | The user took over with the wheel or a touch: abandon our animation. |
| src/client/index.js | 2676 | onFocusLoss | Losing the window or the tab must not leave a hold or a stale pointer |
| src/client/index.js | 3147 | makeTurnPeek | The ledger behind `TURNS`, and the only thing that touches it. |
| src/client/index.js | 3271 | makePhaseLedger | The ledger behind `PHASES_MODEL`, and the only thing that touches the |
| src/client/index.js | 3386 | makeRunLedger | The ledger behind `RUNS`, and the only thing that touches it. |
| src/client/index.js | 6214 | applyBoardPageInk | Paint the page with the host's theme. |
| src/client/index.js | 6266 | sizePanel | Fit the panel to the configured size. |
| src/client/index.js | 6279 | placementMargin | How far the panel is held off the edge it is parked against. |
| src/client/index.js | 6291 | placePanel | Park the panel according to the configured position. The one place that |
| src/client/index.js | 6319 | serviceOf | One host service, however this context publishes it. These two are read |
| src/client/index.js | 6338 | taskServices | The session feed, the workspace registry, and the workspace navigator. |
| src/client/index.js | 6367 | statusFor | The shell's unified status entry for one conversation, if it publishes one. |
| src/client/index.js | 6384 | currentSession | The conversation on screen, as the shell's own shortcuts see it: the one |
| src/client/index.js | 6404 | currentSessionRunning | True when the conversation on screen has a turn in flight. |
| src/client/index.js | 6481 | watchEntries | Follow the conversation on screen for the life of the page, so an |
| src/client/index.js | 6508 | noteEntry | Start the arrival of one conversation, unless this one already had its |
| src/client/index.js | 6531 | cancelEntry | Drop the pending placement without touching what was already decided. |
| src/client/index.js | 6541 | stopEntries | Stop following arrivals; the next page arms its own watch. |
| src/client/index.js | 6566 | settleEntry | One frame of an arrival: wait until the page shows this conversation at |
| src/client/index.js | 6646 | entryRunning | Whether the conversation still has a turn in flight, or null while the |
| src/client/index.js | 6664 | lastInputRow | The last message a person wrote in the transcript, if one is on screen. |
| src/client/index.js | 6685 | entryScroller | The box a transcript row scrolls in: the nearest ancestor that declares |
| src/client/index.js | 6706 | anchorEntry | Put one transcript row at the top of its scrollport, within the box's |
| src/client/index.js | 6733 | settleEntryScroll | Let the shell treat the placement as a finished reading move. |
| src/client/index.js | 6755 | statusOf | What one conversation is doing right now, as a short label. |
| src/client/index.js | 6775 | turnsOf | The turn count already peeked for a conversation, or null. |
| src/client/index.js | 6785 | statusIsLive | True for the statuses that mean a turn is in flight: one that is running, |
| src/client/index.js | 6813 | noteDeliveries | Note the turn ends: a conversation this page watched run, no longer running. |
| src/client/index.js | 6839 | syncRuns | } |
| src/client/index.js | 6856 | watchRuns | Follow the status source for the life of the page, so a turn is stamped |
| src/client/index.js | 6879 | loadRunStamps | Read the stamps the previous page left behind, dropping the ones that are |
| src/client/index.js | 6887 | forgetRuns | Stop watching, and forget every stamp the watch had taken. |
| src/client/index.js | 6896 | runSince | The moment the turn in flight in one conversation was seen to start. |
| src/client/index.js | 6912 | elapsedText | How long a turn has been in flight, at minute resolution. |
| src/client/index.js | 6930 | tickClocks | Repaint the live chips, in place. |
| src/client/index.js | 6960 | clockDelay | Milliseconds until the next whole minute of the oldest clock given. |
| src/client/index.js | 6971 | startClock | Start the tick that keeps the clocks on screen honest. |
| src/client/index.js | 6982 | stopClock | Stop the tick: the window closed, or nothing on screen is running. |
| src/client/index.js | 7020 | donePulseAmount | How far into the beat `progress` (0..1) is, as a 0..1 swell. |
| src/client/index.js | 7034 | paintDonePulse | Paint the beat on every "just finished" chip on screen. |
| src/client/index.js | 7050 | tickDonePulse | One frame of the beat; schedules the next, or puts the chips back. |
| src/client/index.js | 7074 | startDonePulse | Start the beat, unless there is nothing to point at or the OS asked for |
| src/client/index.js | 7082 | stopDonePulse | Cancel the beat and put every chip it touched back. |
| src/client/index.js | 7100 | requestTurns | Queue a turn count for every loaded row that does not have one yet. |
| src/client/index.js | 7113 | drainPeeks | Start as many queued peeks as the concurrency budget allows. |
| src/client/index.js | 7132 | peekTurns | Read one session's `sessionStats.turns` and let go of it again. |
| src/client/index.js | 7201 | cancelPeeks | Drop every queued and in-flight peek; the window closed or unloaded. |
| src/client/index.js | 7206 | paletteText | Built-in string for the task window; it is plugin chrome, not shell copy. |
| src/client/index.js | 7217 | relativeTime | Coarse "how long ago" for a row. Deliberately four buckets, so a list |
| src/client/index.js | 7228 | paletteHint | Footer hint, rebuilt from the live bindings and the current depth. |
| src/client/index.js | 7287 | paletteHeadline | The one line above the list: what is on the reader's plate right now. |
| src/client/index.js | 7317 | conversationPool | Every conversation worth offering, newest first. |
| src/client/index.js | 7364 | sortByRecency | Sort rows by recency, newest first, with the id as a deterministic |
| src/client/index.js | 7383 | hereIndex | Where the conversation on screen sits in a list, or 0 when it is not |
| src/client/index.js | 7409 | firstOwedIndex | Where the selection opens: the first thing waiting on the reader, else |
| src/client/index.js | 7442 | attentionOf | Which attention block a conversation belongs to, or null for the plain |
| src/client/index.js | 7486 | paletteBlocks | Split the pool into the attention blocks and the browsing blocks. |
| src/client/index.js | 7562 | waitedSince | How long a conversation has been waiting on the reader, as a stamp. |
| src/client/index.js | 7581 | revealMore | Reveal one more batch of older conversations. |
| src/client/index.js | 7626 | paletteSections | The blocks to draw, in order, each with its header. |
| src/client/index.js | 7665 | rebuildRows | Rebuild `rows` and `sections` from the two blocks. |
| src/client/index.js | 7691 | folderIndex | Which folder each conversation lives in, as `{ label, path }` keyed by |
| src/client/index.js | 7728 | folderById | One workspace, by the id the board files its goals under. |
| src/client/index.js | 7760 | workspaceForGoal | The workspace a new conversation started from one goal would join. |
| src/client/index.js | 7789 | boardBlockByKey | One goal of the last paint, by the key a card is filed under. |
| src/client/index.js | 7803 | folderLabel | What a folder reads as on a row: the Workspace's own title, else the last |
| src/client/index.js | 7835 | rowColumns | The row grid: the state chip, the name, and the metadata — tag, stage, |
| src/client/index.js | 7855 | columnOf | The grid column one cell belongs to, on this repaint. |
| src/client/index.js | 7868 | widestCell | The widest content width among one column's cells. |
| src/client/index.js | 7894 | fitColumns | Give every row the same tracks, sized to what is actually on screen. |
| src/client/index.js | 7926 | namesOwnFolder | Whether a row in this block has to name its own folder. |
| src/client/index.js | 7938 | buildRow | One list row. Clicking it switches, so the window is not keyboard-only. |
| src/client/index.js | 8122 | buildRenameInput | The name box that replaces a row's title while it is being renamed. |
| src/client/index.js | 8157 | focusRename | Put the caret in the name box, with the whole name selected the first time |
| src/client/index.js | 8181 | beginRename | Start renaming the selected conversation. |
| src/client/index.js | 8190 | cancelRename | Drop the edit and repaint the row as it was. |
| src/client/index.js | 8204 | commitRename | Hand the typed name to the host. |
| src/client/index.js | 8241 | renameSession | Rename one conversation, the way the shell's own sidebar does it: retain |
| src/client/index.js | 8291 | archiveSession | Archive the selected conversation, through the host's own action. |
| src/client/index.js | 8331 | archiveFailureText | A reason from whatever the host rejected an archive with. |
| src/client/index.js | 8352 | archiveSelected | Archive the selected row, with the footer saying what happened. |
| src/client/index.js | 8373 | failureText | A short reason from whatever the host rejected with: a remote failure |
| src/client/index.js | 8385 | setPaletteNotice | Say something in the footer. The next repaint restores the hint, so a |
| src/client/index.js | 8400 | resetPaintScratch | Put this repaint's measurements away, ready for the next one. |
| src/client/index.js | 8416 | renderPalette | Repaint the list from `PALETTE.sections`; cheap enough at this size. |
| src/client/index.js | 8487 | moreReachable | Whether the "More" seat has anything left to give. |
| src/client/index.js | 8504 | buildSectionHeader | One block heading. It is not selectable and not a row: it names the block |
| src/client/index.js | 8548 | scrollSelectionIntoView | Keep the cursor visible when the list is longer than the panel. |
| src/client/index.js | 8562 | moreHeadingNode | The "More" heading element currently on screen, or null. |
| src/client/index.js | 8588 | refreshPalette | Re-read both feeds, holding the selection on the same conversation and |
| src/client/index.js | 8634 | selectedRow | The conversation under the cursor, or null when the cursor is standing on |
| src/client/index.js | 8650 | moreSeatAt | Where the "More" seat stands in the row order, as a row index. |
| src/client/index.js | 8673 | moveSelection | Move the selection, wrapping at both ends. |
| src/client/index.js | 8717 | activateSelection | Act on whatever the selection is standing on. |
| src/client/index.js | 8729 | openPalette | Mount the window and read the feed. Rolling state is torn down first: |
| src/client/index.js | 8841 | closePalette | Unmount the window and drop every feed subscription. |
| src/client/index.js | 8901 | paletteKeyDown | Route one keystroke to the open window. |
| src/client/index.js | 9025 | composerRoot | The message box: the rich-text editor root the shell puts the caret into. |
| src/client/index.js | 9042 | rememberComposer | Remember the element a focus landed on. It is the fallback for a host |
| src/client/index.js | 9059 | isComposerEditor | True when an element is a rich-text editor, i.e. the message box — and |
| src/client/index.js | 9075 | noteFocusRequest | Mark that the user just asked for the keyboard themselves, so the focus |
| src/client/index.js | 9094 | clearFocusRequest | Drop a request the user has just superseded by doing something else. |
| src/client/index.js | 9109 | isActivating | True for a control a bare Space activates by itself. Such a control keeps |
| src/client/index.js | 9122 | focusComposer | Put the keyboard in the message box: what the focus key is for. |
| src/client/index.js | 9147 | composerIsEmpty | True when the message box holds nothing the user put there. |
| src/client/index.js | 9170 | leaveEmptyComposer | The focus key pressed again, inside the box it put the caret in: hand the |
| src/client/index.js | 9198 | inComposer | True when a keystroke was aimed at the message box. |
| src/client/index.js | 9221 | menuOpen | True while a suggestion menu is waiting to be confirmed. |
| src/client/index.js | 9250 | onSendKey | True when this keystroke is a send, and the keyboard should not stay in |
| src/client/index.js | 9279 | doubleEnterSends | True when this Enter is the second half of a double-Enter send. |
| src/client/index.js | 9309 | sendFromComposer | Send the draft by handing the host the key it already sends with. |
| src/client/index.js | 9360 | handBackAfterSend | Give the keyboard back to the page after a send, without waiting for a |
| src/client/index.js | 9391 | breakLine | Turn a bare Enter into the host's own line break. |
| src/client/index.js | 9445 | onFocusIn | Keep the message box from taking the keyboard on its own. |
| src/client/index.js | 9471 | noteFocusReturn | Widen the licence to a focus arriving right after the window got the |
| src/client/index.js | 9483 | justReturned | Whether a focus arriving now is the tail of the window coming back. |
| src/client/index.js | 9495 | onPointerDown | A press says where the keyboard should be: inside a text field it asks |
| src/client/index.js | 9520 | dismissOutsidePress | Put an open window away when the press landed beside it. |
| src/client/index.js | 9546 | pressMissesWindow | Whether a press landed outside an open window's card. |
| src/client/index.js | 9562 | activateSession | Switch the main view to one conversation. |
| src/client/index.js | 9620 | reportStoreFull | Say that the board could not be written, once. |
| src/client/index.js | 9627 | makeBoardStore | } |
| src/client/index.js | 11316 | makeHistory | The board's history: what was done, and how to put it back. |
| src/client/index.js | 11440 | makeNoteStore | The lines pinned to conversations, and the only thing that touches them. |
| src/client/index.js | 11581 | makeHistoryStore | The history's own store: one record per local day, in IndexedDB. |
| src/client/index.js | 11762 | makeJournal | The sessions a day inherited, kept where a repaint can reach them. |
| src/client/index.js | 11937 | makeCarryStore | } |
| src/client/index.js | 12032 | dayOf | The local day a moment belongs to, as `YYYY-MM-DD`. |
| src/client/index.js | 12041 | daysBetween | How many local days lie between two `YYYY-MM-DD` days. |
| src/client/index.js | 12051 | readMoment | The page the board last drew, as it was left, or null. |
| src/client/index.js | 12065 | forgetMoment | Forget the page that was left, once it has been filed. |
| src/client/index.js | 12089 | noteMoment | Remember the page this repaint draws. |
| src/client/index.js | 12113 | momentHeld | Whether the store still holds exactly the bytes this page last wrote. |
| src/client/index.js | 12132 | pageDoc | The arrangement a day's page keeps. |
| src/client/index.js | 12158 | pageView | The page as it reads, frozen. |
| src/client/index.js | 12208 | settleDay | File the page that was left, and start today. |
| src/client/index.js | 12243 | filePage | Write one page, and keep the history's size honest. |
| src/client/index.js | 12276 | settleCarry | Carry the members of the page just filed into today. |
| src/client/index.js | 12293 | pruneHistory | Keep the newest `snapshotKeepDays` pages, and no more. |
| src/client/index.js | 12311 | dropCarried | Let go of the conversations carried longest with no movement. |
| src/client/index.js | 12339 | maybeShowSeal | Show the day that just ended, once, the first time the board is up after it. |
| src/client/index.js | 12361 | sealCounts | The counts one day's summary reads off. |
| src/client/index.js | 12382 | sealLeft | What the desk still owes the reader, as of this press. |
| src/client/index.js | 12411 | paintSeal | Draw one day's summary. |
| src/client/index.js | 12487 | closeSeal | Take the day's summary down. |
| src/client/index.js | 12498 | historySearchRow | The one-line search above the days. |
| src/client/index.js | 12531 | searchHistory | Find a sentence across the pages, newest first. |
| src/client/index.js | 12573 | historyMatches | The lines of one page that carry the needle: its cards, its notes, its names. |
| src/client/index.js | 12601 | historyHitRow | One page a search found, with the lines it was found by. |
| src/client/index.js | 12639 | openBoardHistory | Open the history: the pages the board has been. |
| src/client/index.js | 12712 | closeBoardHistory | Take the history panel down, whichever page it was showing. |
| src/client/index.js | 12734 | renderHistory | Draw the list of days. |
| src/client/index.js | 12761 | historyNote | One quiet sentence where a page would be. |
| src/client/index.js | 12769 | historyMeta | How a page reads at a glance: what it was made of. |
| src/client/index.js | 12780 | historyDayRow | One day in the list, and its page once it is opened. |
| src/client/index.js | 12808 | historyDetail | One day's page, as it read: its goals, their conversations, its cards. |
| src/client/index.js | 12934 | restoreDay | Copy one page into today. |
| src/client/index.js | 12959 | applyPageOrder | Put the page's own arrangement back onto the panels. |
| src/client/index.js | 12977 | settleRestoredCarry | Seat a restored page's members as today's carried set. |
| src/client/index.js | 12991 | keepBackup | Keep what a restore or an import is about to replace. |
| src/client/index.js | 13004 | takeBeforeBackup | Take back what the last restore or import replaced. |
| src/client/index.js | 13022 | downloadJson | Hand a file to the browser. |
| src/client/index.js | 13056 | exportHistory | Write the board, its notes and every page into one file. |
| src/client/index.js | 13087 | pickHistoryFile | Ask for one file, and take it in when it arrives. |
| src/client/index.js | 13122 | importHistory | Take in one exported file. |
| src/client/index.js | 13167 | toggleBoard | The board the plugin opens when a page is not available. |
| src/client/index.js | 13180 | showBoard | } |
| src/client/index.js | 13204 | showOverview | Open the overview page: the board's own button, and the sidebar's row. |
| src/client/index.js | 13228 | pointInSelection | Whether one right press landed inside the words the reader selected. |
| src/client/index.js | 13269 | onContextMenu | The way back from a conversation: a right press on its page. |
| src/client/index.js | 13289 | beginBoardNote | Start typing the line on one card. |
| src/client/index.js | 13302 | commitBoardNote | Keep what the open field says, and close it. |
| src/client/index.js | 13317 | cancelBoardNote | Throw the open field away, leaving the card as it was. |
| src/client/index.js | 13333 | openNote | The note key: open the board on the conversation on screen, with its |
| src/client/index.js | 13370 | pinToBoard | Put one conversation on the board by hand. |
| src/client/index.js | 13396 | startOfToday | Midnight today, in the reader's own zone. |
| src/client/index.js | 13430 | goalByKey | The canvas as it is drawn: one block per workspace in play, the |
| src/client/index.js | 13456 | nextGoalName | The name a goal cut from a card starts with: the one it came from, plus |
| src/client/index.js | 13477 | cardVerdictOf | What the reader has said about a conversation, if it still applies. |
| src/client/index.js | 13495 | noteCardFinished | Write down that a turn ended, before the shell forgets it did. |
| src/client/index.js | 13515 | goalOfRow | Which goal one conversation is drawn in. |
| src/client/index.js | 13526 | boardBlocks | } |
| src/client/index.js | 13725 | rememberFork | Record a fork this plugin watched, and repaint a board that is up. |
| src/client/index.js | 13749 | inheritForkHome | File a branch in the goal its parent is in. |
| src/client/index.js | 13772 | revealBoardCard | Bring one card into view, without moving the paper any further than it |
| src/client/index.js | 13795 | watchForks | Watch the sessions service for forks, so a branch made anywhere in the |
| src/client/index.js | 13835 | boardPlaces | The places the blocks will be drawn at. |
| src/client/index.js | 13865 | firstFreeSlot | The first place on the paper no block already stands on. |
| src/client/index.js | 13897 | slotTaken | Whether a block already stands on a place. |
| src/client/index.js | 13923 | boardPanelHeights | How tall each painted panel stands, keyed by the block it is. |
| src/client/index.js | 13944 | boardPanelWidths | How wide each painted panel stands, keyed by the block it is. |
| src/client/index.js | 13970 | boardExtent | How big the stage has to be to hold everything on it. |
| src/client/index.js | 13998 | applyBoardZoom | Put the canvas's magnification on the paper. |
| src/client/index.js | 14021 | setBoardZoom | Zoom the canvas, keeping one point of it where it is on screen. |
| src/client/index.js | 14053 | fitBoardToWindow | Scale the canvas so the whole of it stands inside the window. |
| src/client/index.js | 14083 | onBoardResize | A window that changed size re-fits a canvas that was fitted to it. |
| src/client/index.js | 14093 | onBoardWheel | Ctrl/Cmd + wheel zooms the canvas, the way every canvas does. |
| src/client/index.js | 14113 | nextCardPlace | Where a new loose card goes when the reader did not point at a place. |
| src/client/index.js | 14144 | boardFreePlace | A place on the paper for a goal that was just asked for, near the eye. |
| src/client/index.js | 14187 | addBoardGoal | Stand a new goal on the canvas, ready to be given a purpose. |
| src/client/index.js | 14209 | closeNewSessionSheet | Take the new-conversation sheet down, and forget what it was writing. |
| src/client/index.js | 14234 | paintNewSessionBusy | Put the sheet's confirm button in step with the one host round trip. |
| src/client/index.js | 14250 | paintNewSessionModel | Say which model the sheet would start the conversation on. |
| src/client/index.js | 14274 | paintNewSessionField | Paint one of the sheet's fields as focused or not. |
| src/client/index.js | 14285 | watchNewSessionField | Let a field say where the caret is, for as long as it lives. |
| src/client/index.js | 14300 | openNewSessionSheet | Show the sheet that asks for a conversation's name and the words it opens with. |
| src/client/index.js | 14509 | commitNewSessionSheet | Read the sheet and start the conversation it describes. |
| src/client/index.js | 14543 | applyNewSessionModel | Put the model the sheet was set to onto the conversation just made. |
| src/client/index.js | 14585 | startNewSessionForGoal | Start one conversation under one goal, with the reader's words. |
| src/client/index.js | 14687 | tidyPanels | The panels as a tidy sees them: a rectangle of paper, the conversations |
| src/client/index.js | 14758 | tidyHomeOf | Which panel a card belongs beside, if any. |
| src/client/index.js | 14783 | tidyColumnX | The first x at or right of `x` that no panel already stands in. |
| src/client/index.js | 14801 | tidyBySession | The order cards stand in beside their panel: the panel's own order. |
| src/client/index.js | 14807 | tidyByTray | The order the inbox tray keeps: what is finished sinks to the bottom. |
| src/client/index.js | 14827 | tidyGroup | Lay one group of cards out as a column beside its panel. |
| src/client/index.js | 14888 | tidyPlan | Where the thoughts still on the paper stand, as a list of places. |
| src/client/index.js | 14929 | tidyPanelOrder | The order a tidy packs panels in: left to right, top to bottom, tray last. |
| src/client/index.js | 14951 | tidyRowWidth | How wide one row of a tidy may be, in unzoomed pixels. |
| src/client/index.js | 14976 | tidyPlaces | Where every panel stands after a tidy. |
| src/client/index.js | 15018 | tidyBoard | Tidy the canvas: put the thoughts where they belong, then lay the panels |
| src/client/index.js | 15098 | tidyLooseCards | Put the thoughts that are still on the paper clear of the panels. |
| src/client/index.js | 15150 | glideTidyPanels | Slide one tidy's panels to their new places, then put the cards around |
| src/client/index.js | 15204 | glideTidyBatch | Fly one tidy's cards to their places, a beat apart. |
| src/client/index.js | 15262 | openBoard | Mount the board. |
| src/client/index.js | 15311 | mountBoardInto | Build the board's parts into a root element, whichever mount owns it. |
| src/client/index.js | 15622 | unmountBoard | Unmount the board, whichever mount holds it. |
| src/client/index.js | 15728 | closeBoard | Take the floating board down, element and all. |
| src/client/index.js | 15755 | boardFieldOpen | Repaint the whole canvas from the feeds. |
| src/client/index.js | 15781 | renderBoard | } |
| src/client/index.js | 16004 | boardStatusFingerprint | The board's reading of every card's status, as one string. |
| src/client/index.js | 16025 | renderBoardOnStatus | Repaint the board for a status tick, but only if something on screen |
| src/client/index.js | 16040 | tickBoardClocks | Move the running cards' minute hands, in place. |
| src/client/index.js | 16063 | startDayTimer | Arm the one timer that watches for midnight. |
| src/client/index.js | 16078 | stopDayTimer | Stop the midnight timer: the board closed, or the page went away. |
| src/client/index.js | 16085 | startBoardClock | Start the tick that keeps the board's clocks honest. |
| src/client/index.js | 16096 | stopBoardClock | Stop the tick: the board closed, or nothing on it is running. |
| src/client/index.js | 16118 | paintHistory | Paint the "only what is marked" toggle to match the state it stands for. |
| src/client/index.js | 16133 | paintBoardStarFilter | } |
| src/client/index.js | 16150 | slotHue | One workspace on the canvas: a heading that can be dragged, and the |
| src/client/index.js | 16163 | slotSeed | Which seat a block starts on: its own id, never its name. |
| src/client/index.js | 16180 | boardSlots | Give every panel on this paint its own slice of the wheel. |
| src/client/index.js | 16215 | blockSeat | The seat one block wears: the one written down, else the one this paint gave it. |
| src/client/index.js | 16235 | goalHue | The hue one place is washed with, or null for the tray. |
| src/client/index.js | 16241 | blockInk | The colour one panel's own mark wears. |
| src/client/index.js | 16258 | noteHue | The paper one note is written on. |
| src/client/index.js | 16262 | notePaper | } |
| src/client/index.js | 16289 | noteInkOf | The ink one note is drawn in. |
| src/client/index.js | 16399 | boardIcon | One of those glyphs, at a size, as an element. |
| src/client/index.js | 16456 | boardNoteCols | How many rows an idea card's field needs for what it holds. |
| src/client/index.js | 16462 | boardTextRows | } |
| src/client/index.js | 16487 | boardEditorRows | The lines a card's field opens on. |
| src/client/index.js | 16515 | boardNoteMetrics | How much paper one idea card takes. |
| src/client/index.js | 16549 | noteParts | How much paper one idea card takes: its heading, and the lines it holds. |
| src/client/index.js | 16569 | boardCardBox | How much paper one idea card takes at rest. |
| src/client/index.js | 16595 | boardCardOpenBox | The paper a note takes while its field is up: all of its body, up to the cap. |
| src/client/index.js | 16617 | canvasPointOf | Where a point on the screen falls on the paper. |
| src/client/index.js | 16639 | raiseBoardCard | Bring one card to the front of the paper. |
| src/client/index.js | 16659 | beginNoteLift | Lift one put-away note out of the tray, under the hand. |
| src/client/index.js | 16709 | markDropGoal | Say which goal would take the card if the hand let go of it here. |
| src/client/index.js | 16728 | markDoneDrop | Light the finished strip a carried conversation would land in. |
| src/client/index.js | 16741 | boardHomeOf | The goal one conversation is drawn in on this paint, or null. |
| src/client/index.js | 16756 | boardRowOf | One conversation of this paint, by id. |
| src/client/index.js | 16772 | sendToDone | Put one conversation in the finished strip, word and all. |
| src/client/index.js | 16789 | bringBackFromDone | Take one conversation back out of the finished strip, word and all. |
| src/client/index.js | 16808 | markNoDrop | Say, under the hand, that the paper will not take this card. |
| src/client/index.js | 16834 | dropNoDropTip | Take the "the paper will not take it" line off the page. |
| src/client/index.js | 16853 | goalNodeAt | The goal panel under a native drag, asked in the order a browser answers. |
| src/client/index.js | 16865 | nearestGoal | The goal panel an element stands in, or null when it stands in none. |
| src/client/index.js | 16881 | goalUnder | The goal the pointer is standing in, as the id a card is filed under. |
| src/client/index.js | 16899 | doneBarUnder | The finished strip under the hand, or null. |
| src/client/index.js | 16928 | goalHeadKeyUnder | The goal whose heading an element stands in, as the key a card starts a |
| src/client/index.js | 16953 | boardDragHasText | Whether a native drag carries words, the one thing the shell's rows set. |
| src/client/index.js | 16991 | sessionInPayload | The words a native drag is carrying, read where the browser allows it. |
| src/client/index.js | 17018 | boardDragText | } |
| src/client/index.js | 17036 | clearBoardDragGoal | Take the goal highlight a native drag drew off the paper. |
| src/client/index.js | 17053 | onNativeDragEnd | A native drag is over, however it ended. |
| src/client/index.js | 17067 | onBoardDragOver | Say, while a native drag is over the canvas, which goal would take it. |
| src/client/index.js | 17083 | onBoardDragLeave | The native drag left the canvas: take the goal highlight with it. |
| src/client/index.js | 17103 | onBoardDrop | A conversation let go on the canvas, carried in from the host's sidebar. |
| src/client/index.js | 17130 | dropSessionOntoBoard | Take one conversation the reader dragged in, and keep it. |
| src/client/index.js | 17155 | buildSeatMenu | The twelve colours a goal can wear. |
| src/client/index.js | 17188 | pickSeat | One colour, as a press. |
| src/client/index.js | 17213 | buildGoalMenu | The verbs on a goal that are not worth a seat of their own. |
| src/client/index.js | 17236 | goalMenuItem | One line of that menu. |
| src/client/index.js | 17267 | placeGoalMenu | Stand a goal's menu under its ⋯, inside the panel's right edge. |
| src/client/index.js | 17272 | buildBoardBlock | } |
| src/client/index.js | 17683 | trayCaption | The conversations of one block, cut into threads. |
| src/client/index.js | 17698 | trayQuiet | A quiet line where a section has nothing in it yet. |
| src/client/index.js | 17716 | buildTrayNote | One note, as a line of the tray. |
| src/client/index.js | 17864 | trayInk | Ink every conversation inside one node with the tray's paper. |
| src/client/index.js | 17876 | doneBinCards | Every note put away in the finished-cards bin, newest first. |
| src/client/index.js | 17881 | doneBinCardsOf | The put-away notes one conversation was handed, newest first. |
| src/client/index.js | 17900 | openDoneBinFor | Open the bin on one conversation's own put-aways. |
| src/client/index.js | 17915 | paintDoneBin | Say how many cards the bin holds, and what it is doing. |
| src/client/index.js | 17930 | toggleDoneBin | Open or close the finished-cards list. |
| src/client/index.js | 17948 | buildDoneRow | One finished note, as a line of the card's list. |
| src/client/index.js | 18035 | mountDoneBin | Put the finished-cards list on the board, or take it away. |
| src/client/index.js | 18123 | ejectFromDoneBin | Put one card back on the paper, out of the finished-cards bin. |
| src/client/index.js | 18142 | buildInboxBody | The tray's body: the conversations nothing accounts for, and the notes put away here. |
| src/client/index.js | 18187 | boardBlockColumns | How many columns a panel reads across. |
| src/client/index.js | 18203 | boardCardStacked | Whether one card is drawn inside a conversation's column. |
| src/client/index.js | 18226 | boardBlockWidth | How wide a panel stands. |
| src/client/index.js | 18250 | buildBoardColumns | A goal's conversations, laid out across the panel. |
| src/client/index.js | 18292 | buildBoardColumn | One conversation of a panel, as the column it stands in. |
| src/client/index.js | 18320 | buildDoneBar | The long strip at the foot of a goal: what the reader finished today. |
| src/client/index.js | 18399 | buildQuietStrip | The conversations a panel carried in and nobody has touched, one line each. |
| src/client/index.js | 18455 | buildQuietRow | One quiet conversation, as the line it is drawn as. |
| src/client/index.js | 18527 | buildQuietStack | The thoughts under one quiet conversation, once its count was pressed. |
| src/client/index.js | 18546 | buildBoardStack | The thoughts filed under one conversation. |
| src/client/index.js | 18612 | markCardFresh | Wear the one beat a completion is worth - once. |
| src/client/index.js | 18650 | verdictText | The word one conversation wears, in the reader's language. |
| src/client/index.js | 18667 | buildVerdictChip | What the reader said about a card, as the chip that says it. |
| src/client/index.js | 18694 | buildStateAdd | The empty seat, for a card the shell has nothing to say about. |
| src/client/index.js | 18714 | stateToggle | Open or close one card's state menu. |
| src/client/index.js | 18735 | buildVerdictMenu | The two words, and the way back to having said nothing. |
| src/client/index.js | 18755 | verdictItem | One word in that menu. |
| src/client/index.js | 18788 | clearVerdictItem | The row that takes the word back. |
| src/client/index.js | 18808 | buildBoardCard | } |
| src/client/index.js | 19276 | beginBlockRename | Start typing a goal's name into its heading. |
| src/client/index.js | 19282 | commitBlockRename | Keep the name the heading says, and close the field. |
| src/client/index.js | 19294 | cancelBlockRename | Throw the typed name away, leaving the goal as it was called. |
| src/client/index.js | 19311 | goalBaseName | The last piece of a workspace path: what the workspace is called. |
| src/client/index.js | 19324 | beginGoalIntent | Start writing what a goal is for. |
| src/client/index.js | 19339 | commitGoalIntent | Keep what the open line says, and close it. |
| src/client/index.js | 19351 | cancelGoalIntent | Throw the typed line away, leaving the goal as it was. |
| src/client/index.js | 19370 | removeBoardGoal | Take one goal off the canvas, with a few seconds to bring it back. |
| src/client/index.js | 19417 | boardNameCollisions | Which drawn cards share a name, and where each one stands in its group. |
| src/client/index.js | 19443 | boardTitleOf | The name one card wears: the reader's word while the shell catches up, |
| src/client/index.js | 19459 | noteCardTitle | Put the reader's word on a card before the shell has answered. |
| src/client/index.js | 19474 | settleTitles | Let go of the stand-in names the feed has caught up with, or outlived. |
| src/client/index.js | 19493 | beginBoardRename | Start renaming one conversation from its card. |
| src/client/index.js | 19511 | commitBoardRename | Keep what the open name field says, and rename the conversation. |
| src/client/index.js | 19550 | cancelBoardRename | Throw the open name field away, leaving the conversation as it was. |
| src/client/index.js | 19569 | forkBoardCard | Start a branch from one conversation, and draw the line when it lands. |
| src/client/index.js | 19615 | returnForkMark | Let a conversation's branch mark answer again, and say so on the card. |
| src/client/index.js | 19631 | waitForBranchRow | The catalogue row for one conversation, asked for until it arrives. |
| src/client/index.js | 19663 | settleBranchName | Give a fresh branch a name nobody else is using, and answer with it. |
| src/client/index.js | 19706 | pasteIntoComposer | Put words in the message box of the conversation on screen. |
| src/client/index.js | 19740 | composerHasText | Whether the message box already holds something. |
| src/client/index.js | 19756 | boxHasText | Whether one box already holds words. |
| src/client/index.js | 19771 | seatCaretAtEnd | Put the caret at the end of the box's content. |
| src/client/index.js | 19810 | dropCardIntoComposer | Hand one loose card's words to a conversation's message box. |
| src/client/index.js | 19830 | pasteIntoBoxNow | Put the words in the box that is on screen right now, if there is one. |
| src/client/index.js | 19852 | putThroughEditor | Put text into the editor through the editing command. |
| src/client/index.js | 19871 | pasteThroughEvent | Put text into the editor as a real paste event. |
| src/client/index.js | 19897 | ideaFocusCard | One card from the board's own document, by id. |
| src/client/index.js | 19917 | ideaFocusOrigin | Where a press happened, as a point the sheet can grow out of. |
| src/client/index.js | 19942 | animateIdeaFocusIn | Let the sheet grow out of the place the reader pointed at. |
| src/client/index.js | 19985 | ideaFocusSessionTitle | The name of the conversation a thought is tied to, for the sheet's foot. |
| src/client/index.js | 20006 | paintIdeaFocusDone | Keep the sheet's done box in step with the card it belongs to. |
| src/client/index.js | 20027 | cleanIdeaTitle | Keep the title on one line while letting it wrap on the paper. |
| src/client/index.js | 20035 | growIdeaTitle | Let the title field take as many lines as the words it is showing. |
| src/client/index.js | 20054 | writeIdeaFocus | Write what the sheet says into the card it belongs to. |
| src/client/index.js | 20078 | openIdeaFocus | Open one idea card, or a blank new one, in the centre of the board. |
| src/client/index.js | 20322 | closeIdeaFocus | Close the sheet, keeping what it says. |
| src/client/index.js | 20373 | deliverIdeaFocus | Hand the sheet's thought to the conversation it is tied to. |
| src/client/index.js | 20397 | buildIdeaMenu | The menu behind a thought card's ⋯. |
| src/client/index.js | 20440 | ideaMenuItem | One line of that menu. |
| src/client/index.js | 20469 | buildSessionMenu | The verbs on a conversation card that are not worth a seat of their own. |
| src/client/index.js | 20510 | placeCardMenu | One line of that menu. |
| src/client/index.js | 20527 | cardMenuItem | } |
| src/client/index.js | 20566 | buildBoardLooseCard | One loose card: a thought the reader put on the canvas rather than in a |
| src/client/index.js | 20917 | boardJoinText | Join a card's two parts back into the one string the store keeps. |
| src/client/index.js | 20936 | beginBoardCard | Start typing into one loose card - at its title, or at its body. |
| src/client/index.js | 20976 | boardTakeCardText | Keep what the open field says, and close it. |
| src/client/index.js | 20993 | commitBoardCard | } |
| src/client/index.js | 21006 | cancelBoardCard | Throw the open field away, leaving the card as it was last written. |
| src/client/index.js | 21027 | settleBoardCardForPress | Settle the open card field for a press, without the paint a settle |
| src/client/index.js | 21050 | addBoardCardAt | Open a new thought at a place, and let the sheet write it. |
| src/client/index.js | 21067 | addBoardCard | Open a new thought where the reader is looking, or below everything when |
| src/client/index.js | 21084 | removeLooseCard | Take one loose card off the canvas. |
| src/client/index.js | 21129 | removeBoardCard | Take one conversation off the board. |
| src/client/index.js | 21171 | handleOf | A press on a block's heading: the handle the panel is dragged by. |
| src/client/index.js | 21200 | beginStackedCarrier | Lift one card out of a conversation's column, where the hand is. |
| src/client/index.js | 21239 | stackCardBefore | The card a drop should sit above, from where the pointer let go. |
| src/client/index.js | 21267 | closeIdeaMenu | Mark the column the hand is over, or clear every mark. |
| src/client/index.js | 21284 | closeSeatMenu | Put the colour wheel away, without a repaint. |
| src/client/index.js | 21304 | closeGoalMenu | Put a goal's ⋯ menu away, without a repaint. |
| src/client/index.js | 21324 | closeVerdictMenu | Put a card's state menu away, without a repaint. |
| src/client/index.js | 21343 | closeSessionMenu | Put a conversation card's menu away, without a repaint. |
| src/client/index.js | 21359 | paintStackDrop | } |
| src/client/index.js | 21377 | paintHeadDrop | Light the heading of the goal a carried card would start a conversation in. |
| src/client/index.js | 21396 | parkCardOutside | Give a card lifted out of a column a place on the paper. |
| src/client/index.js | 21423 | boardPointerDown | The one press handler on the canvas. |
| src/client/index.js | 21575 | boardNoteDone | Put the drop bands on screen, or take them away. |
| src/client/index.js | 21583 | showDropZones | } |
| src/client/index.js | 21598 | boardListen | Start listening for the rest of a gesture, once it has been armed. |
| src/client/index.js | 21615 | beginSessionGrab | Start a session drag: a sort inside its own panel, a carry outside it. |
| src/client/index.js | 21633 | panelHolds | Whether a hand is still close enough to its panel to be sorting inside it. |
| src/client/index.js | 21651 | beginSessionReorder | Sort one conversation among its neighbours, where the hand is. |
| src/client/index.js | 21710 | paintSessionReorder | Follow the hand, and let the other columns make room as it passes them. |
| src/client/index.js | 21748 | sessionSlotAt | The place the hand is asking for, read off the grid. |
| src/client/index.js | 21794 | leaveSessionReorder | Hand the drag back to the carrier, because the pointer left the panel. |
| src/client/index.js | 21807 | resetSessionReorder | Put every column back where the paint left it. |
| src/client/index.js | 21833 | commitSessionReorder | Write the order the hand chose, once, and draw it. |
| src/client/index.js | 21871 | beginSessionCarrier | Give a carried card its body, where the hand is. |
| src/client/index.js | 21913 | onBoardMove | Follow the pointer: pan the paper, or carry what the hand picked up. |
| src/client/index.js | 22034 | onBoardUp | Let go: write down what the gesture decided, unless it never moved. |
| src/client/index.js | 22312 | handCardToSession | Hand one loose card's words to a conversation, and leave a trace behind. |
| src/client/index.js | 22338 | nameSessionForCard | Let the conversation a card was handed to wear the card's own name. |
| src/client/index.js | 22368 | drawCardLinks | Draw the elbow from every branch back to the conversation it was cut from. |
| src/client/index.js | 22424 | cancelBoardDrag | Drop the gesture and put back what it was carrying. |
| src/client/index.js | 22434 | endBoardDrag | Take the gesture's furniture off the page and forget it. |
| src/client/index.js | 22480 | onBoardBlurDrag | The window losing focus mid-gesture: the pointer left with it. |
| src/client/index.js | 22495 | onBoardDoubleClick | A double click on the paper: write a card right there. |
| src/client/index.js | 22544 | makeNotice | The transient line the plugin speaks in. |
| src/client/index.js | 22767 | showToast | Say one thing for a moment. A second press replaces the line and restarts |
| src/client/index.js | 22772 | hideToast | Take the notice down and drop the pending timer. |
| src/client/index.js | 22786 | SendHintLine | The line that names the send key, contributed to the shell's own dock row |
| src/client/index.js | 22818 | sendKeyLabel | The modifier this machine's send accelerator lives on, named the way the |
| src/client/index.js | 22837 | modelDirectories | The host's session model-selection service, when it publishes one. |
| src/client/index.js | 22853 | effortLevels | The reasoning levels one model offers, in the order the composer's own |
| src/client/index.js | 22877 | levelIndex | Where one level sits in the list. An explicit selection wins; without one |
| src/client/index.js | 22898 | currentLevelId | The level in effect for one selection, read the way the composer's own |
| src/client/index.js | 22909 | isCurrentEntry | Whether one entry is the model the conversation is already on. |
| src/client/index.js | 22927 | rowMarkedLevel | The level one picker row shows as marked, which is the level it would end |
| src/client/index.js | 22947 | rowSubmitLevel | The level one picker row would submit if it were confirmed without the |
| src/client/index.js | 22960 | refusal | A refusal this plugin can explain on its own, so the notice carries |
| src/client/index.js | 22979 | cycleEffort | One press of the reasoning key: step the visible conversation's level one |
| src/client/index.js | 23013 | stepEffort | Read the levels off one session directory and submit the next one. |
| src/client/index.js | 23063 | catalogGroups | Every provider/model the host currently advertises, for the settings page. |
| src/client/index.js | 23101 | groupsOf | The provider groups out of one loaded catalog or directory snapshot. Both |
| src/client/index.js | 23119 | offeredModels | The catalog as a lookup, one entry per `provider/model`. |
| src/client/index.js | 23157 | modelEntries | The configured models the directory currently offers, in the order the |
| src/client/index.js | 23169 | modelIndex | Where one model sits in the list; -1 when it is not one of them. |
| src/client/index.js | 23186 | modelDirectoryOfCurrent | Resolve the model directory behind the conversation on screen. |
| src/client/index.js | 23217 | readModelList | Read the list off one session directory. |
| src/client/index.js | 23261 | readNewSessionModelList | The list the sheet's model row offers. |
| src/client/index.js | 23284 | openNewSessionModelPick | Open the model window for the sheet's model row. |
| src/client/index.js | 23324 | openModelPick | One press of the model key: open the picker on the list of models the |
| src/client/index.js | 23536 | modelPickHint | The line under the picker: what it is showing, and what the keys do. |
| src/client/index.js | 23565 | renderModelPick | Repaint the picker's rows and footer from `MODELPICK.entries`. |
| src/client/index.js | 23588 | markedLevel | The level one row is currently marked with. |
| src/client/index.js | 23603 | confirmLevel | The level one confirm would submit. |
| src/client/index.js | 23626 | buildModelRow | One row of the picker: the model's name with the `current` tag in front of |
| src/client/index.js | 23681 | buildLevelCell | The levels of one model. |
| src/client/index.js | 23734 | levelClickHandler | The press handler for one level chip. |
| src/client/index.js | 23748 | keepModelPickVisible | Keep the selected row in sight when the list is longer than the card. |
| src/client/index.js | 23770 | openModelWindow | Mount the picker, with the selection already on the model in effect. |
| src/client/index.js | 23836 | closeModelPick | Unmount the picker and forget everything it was showing. |
| src/client/index.js | 23872 | moveModelPick | Move the picker's selection, wrapping at both ends. |
| src/client/index.js | 23900 | moveModelPickEntry | Put the selected model somewhere else in the list, and remember it there. |
| src/client/index.js | 23940 | reorderFavorites | Put an ordered list of pairs back into the configured one, in the new |
| src/client/index.js | 23968 | stepModelPickLevel | Step the level of the selected row, wrapping at both ends. |
| src/client/index.js | 23997 | confirmModelPick | Confirm the selected row: submit its model at its marked level, then take |
| src/client/index.js | 24062 | modelToast | The one-line notice after a switch, naming the level when the row has one. |
| src/client/index.js | 24074 | levelName | The readable name of one level of one model, or null when there is none. |
| src/client/index.js | 24096 | modelPickKeyDown | Route one keystroke to the open picker. |
| src/client/index.js | 24174 | switchModel | Read the catalog off one session directory and submit the model and level |
| src/client/index.js | 24275 | makeTranslator | Translate through the locale seat when it is wired, else through the |
| src/client/index.js | 24291 | KeyRow | One rebindable key: focus the box, press the key you want. |
| src/client/index.js | 24331 | SliderRow | One numeric preference. |
| src/client/index.js | 24361 | ChoiceRow | A short set of mutually exclusive options, as a row of toggles. Used for |
| src/client/index.js | 24407 | ModelListGroup | The switchable models as one settings group: what is chosen, in the order |
| src/client/index.js | 24600 | VimSection | The whole Settings → Vim scrolling page. |
| src/client/index.js | 24840 | BoardPage | The board as the main panel's page. |
| src/client/index.js | 24875 | BoardPanelIcon | The sidebar entry's glyph: three columns, which is what the board is. |
| src/client/index.js | 24920 | installBoardPage | Contribute the board as a sidebar entry and a main panel. |
| src/client/index.js | 24984 | overviewToday | What today did, as the overview reads it. |
| src/client/index.js | 25077 | overviewFigure | One figure: the number, and what it counts, read as one block. |
| src/client/index.js | 25095 | overviewNumber | One number in the table: how it reads depends on what it counts. |
| src/client/index.js | 25104 | overviewHeading | One heading of the table, in the same columns as its rows. |
| src/client/index.js | 25122 | mountOverviewInto | Build the overview into an element the host owns. |
| src/client/index.js | 25254 | OverviewPage | The overview as the main panel's page. |
| src/client/index.js | 25290 | OverviewPanelIcon | The sidebar entry's glyph: three bars of a day, rising to the right. |
| src/client/index.js | 25336 | installOverviewPage | Contribute the overview as a page of its own, beside the board. |
| src/client/index.js | 25393 | installWindowCSS | The rules every window this plugin mounts shares, once. |
| src/client/index.js | 25437 | installBoardCSS | Put the board's hover and motion rules on the page, once. |
| src/client/index.js | 25613 | installSettings | Contribute the settings page and its vocabulary. Both contributions are |
| src/client/index.js | 25689 | makeApi | Debug and tuning surface, also used by tools/selftest.mjs. |
| src/client/index.js | 26035 | apply | Client activation. |
