# MAP - lib/client.js

由 `npm run map` 生成，不要手改。找一个功能的入口：先在这里按名字查到行号，再读那一段。

lib/client.js：22489 行，449 个顶层函数。

| 行 | 函数 | 上方注释 |
|---:|---|---|
| 1263 | localeIsZh | Best-effort locale guess, used for the nav label and fallback strings. |
| 1287 | defaults | Shipped defaults as a fresh object, derived from DEFAULTS so a new |
| 1297 | copy | Current preferences as a fresh object. |
| 1321 | isBindableKey | A single printable character, or one of `NAMED_KEYS`, is the only thing |
| 1337 | normalizeKey | Normalise a bound key to its stored form: lower case for characters, |
| 1353 | keyLabel | How a bound key reads in the settings box. A space is invisible in a box |
| 1360 | clampNumber | Clamp a numeric preference to its accepted range. |
| 1376 | sanitizeFavorites | The switchable models as a fresh list of `{provider, model}` pairs. |
| 1395 | persist | Persist the current preferences; storage failures are not fatal. |
| 1404 | announce | Notify the settings page that preferences changed. |
| 1419 | applyPatch | Validate and apply one patch. Rejected patches leave preferences intact. |
| 1493 | firstFree | The preferred key when it is free, else the first free letter. |
| 1513 | repairKeys | Force each key group to be conflict-free. Groups are repaired back to |
| 1577 | migrateArchiveSeat | Move the archive seat into place for a store written before it existed. |
| 1593 | load | Read stored preferences over the defaults. |
| 1646 | setStage | Mark one conversation, or take the mark off it, and repaint. |
| 1663 | stageHandler | The press handler for one stage word on one row. |
| 1680 | cyclePhase | Advance one conversation to the next stage, and repaint the window. |
| 1691 | subscribe | Subscribe to preference changes. |
| 1728 | isEditable | True when the element consumes printable characters itself. |
| 1742 | isScrollable | True when the element is a non-editable box that overflows vertically and |
| 1755 | parentOf | Parent element, crossing shadow boundaries through the host node. |
| 1766 | scrollerFrom | Nearest scrollable ancestor, inclusive. |
| 1776 | largestScroller | Largest visible scroll container; the last-resort target. |
| 1799 | elementAt | The topmost element at a point, when the document can be asked. A host |
| 1820 | pickScroller | Choose the container to scroll. Deterministic order: whatever sits under |
| 1844 | canMove | Whether the container still has room in the requested direction. |
| 1856 | resolveTarget | Walk from the picked container up to the first one that can move. This is |
| 1866 | reducedMotion | Honour the OS "reduce motion" preference. |
| 1876 | suppressSmooth | Pin `scroll-behavior: auto` for the animated element. Without this, a |
| 1885 | stopAnim | Stop the animation loop and restore anything it changed. |
| 1902 | frame | One animation frame: ease `current` toward `target`, frame-rate |
| 1928 | push | Queue a scroll step. Resolves (or reuses) the container, extends the |
| 1955 | stopHold | Cancel the held-key auto-repeat. |
| 1967 | tickHold | Auto-repeat tick: one more step, then schedule the next sooner. |
| 1988 | startHold | Start a hold: one immediate step, then our own accelerating repeat. The |
| 2005 | directionOf | Which direction a pressed key drives, if any. |
| 2020 | onKeyDown | Capture-phase key handler. Runs before the app's own handlers so the |
| 2390 | onKeyUp | Any keyup ends the hold, so a dropped keyup cannot leave the view scrolling. |
| 2416 | onEscapeBlur | Escape leaves a focused composer, so the scroll keys come back. |
| 2441 | onPointerMove | Remember where the pointer is. |
| 2462 | forgetPointer | Forget the remembered pointer, so the focus and centre rules decide again. |
| 2467 | onUserScroll | The user took over with the wheel or a touch: abandon our animation. |
| 2483 | onFocusLoss | Losing the window or the tab must not leave a hold or a stale pointer |
| 2922 | makeTurnPeek | The ledger behind `TURNS`, and the only thing that touches it. |
| 3046 | makePhaseLedger | The ledger behind `PHASES_MODEL`, and the only thing that touches the |
| 3161 | makeRunLedger | The ledger behind `RUNS`, and the only thing that touches it. |
| 5521 | applyBoardPageInk | Paint the page with the host's theme. |
| 5573 | sizePanel | Fit the panel to the configured size. |
| 5586 | placementMargin | How far the panel is held off the edge it is parked against. |
| 5598 | placePanel | Park the panel according to the configured position. The one place that |
| 5626 | serviceOf | One host service, however this context publishes it. These two are read |
| 5645 | taskServices | The session feed, the workspace registry, and the workspace navigator. |
| 5674 | statusFor | The shell's unified status entry for one conversation, if it publishes one. |
| 5691 | currentSession | The conversation on screen, as the shell's own shortcuts see it: the one |
| 5711 | currentSessionRunning | True when the conversation on screen has a turn in flight. |
| 5729 | statusOf | What one conversation is doing right now, as a short label. |
| 5749 | turnsOf | The turn count already peeked for a conversation, or null. |
| 5759 | statusIsLive | True for the statuses that mean a turn is in flight: one that is running, |
| 5787 | noteDeliveries | Note the turn ends: a conversation this page watched run, no longer running. |
| 5813 | syncRuns | } |
| 5830 | watchRuns | Follow the status source for the life of the page, so a turn is stamped |
| 5853 | loadRunStamps | Read the stamps the previous page left behind, dropping the ones that are |
| 5861 | forgetRuns | Stop watching, and forget every stamp the watch had taken. |
| 5870 | runSince | The moment the turn in flight in one conversation was seen to start. |
| 5886 | elapsedText | How long a turn has been in flight, at minute resolution. |
| 5904 | tickClocks | Repaint the live chips, in place. |
| 5934 | clockDelay | Milliseconds until the next whole minute of the oldest clock given. |
| 5945 | startClock | Start the tick that keeps the clocks on screen honest. |
| 5956 | stopClock | Stop the tick: the window closed, or nothing on screen is running. |
| 5994 | donePulseAmount | How far into the beat `progress` (0..1) is, as a 0..1 swell. |
| 6008 | paintDonePulse | Paint the beat on every "just finished" chip on screen. |
| 6024 | tickDonePulse | One frame of the beat; schedules the next, or puts the chips back. |
| 6048 | startDonePulse | Start the beat, unless there is nothing to point at or the OS asked for |
| 6056 | stopDonePulse | Cancel the beat and put every chip it touched back. |
| 6074 | requestTurns | Queue a turn count for every loaded row that does not have one yet. |
| 6087 | drainPeeks | Start as many queued peeks as the concurrency budget allows. |
| 6106 | peekTurns | Read one session's `sessionStats.turns` and let go of it again. |
| 6175 | cancelPeeks | Drop every queued and in-flight peek; the window closed or unloaded. |
| 6180 | paletteText | Built-in string for the task window; it is plugin chrome, not shell copy. |
| 6191 | relativeTime | Coarse "how long ago" for a row. Deliberately four buckets, so a list |
| 6202 | paletteHint | Footer hint, rebuilt from the live bindings and the current depth. |
| 6261 | paletteHeadline | The one line above the list: what is on the reader's plate right now. |
| 6291 | conversationPool | Every conversation worth offering, newest first. |
| 6338 | sortByRecency | Sort rows by recency, newest first, with the id as a deterministic |
| 6357 | hereIndex | Where the conversation on screen sits in a list, or 0 when it is not |
| 6383 | firstOwedIndex | Where the selection opens: the first thing waiting on the reader, else |
| 6416 | attentionOf | Which attention block a conversation belongs to, or null for the plain |
| 6460 | paletteBlocks | Split the pool into the attention blocks and the browsing blocks. |
| 6536 | waitedSince | How long a conversation has been waiting on the reader, as a stamp. |
| 6555 | revealMore | Reveal one more batch of older conversations. |
| 6600 | paletteSections | The blocks to draw, in order, each with its header. |
| 6639 | rebuildRows | Rebuild `rows` and `sections` from the two blocks. |
| 6665 | folderIndex | Which folder each conversation lives in, as `{ label, path }` keyed by |
| 6702 | folderById | One workspace, by the id the board files its goals under. |
| 6734 | workspaceForGoal | The workspace a new conversation started from one goal would join. |
| 6763 | boardBlockByKey | One goal of the last paint, by the key a card is filed under. |
| 6777 | folderLabel | What a folder reads as on a row: the Workspace's own title, else the last |
| 6809 | rowColumns | The row grid: the state chip, the name, and the metadata — tag, stage, |
| 6829 | columnOf | The grid column one cell belongs to, on this repaint. |
| 6842 | widestCell | The widest content width among one column's cells. |
| 6868 | fitColumns | Give every row the same tracks, sized to what is actually on screen. |
| 6900 | namesOwnFolder | Whether a row in this block has to name its own folder. |
| 6912 | buildRow | One list row. Clicking it switches, so the window is not keyboard-only. |
| 7096 | buildRenameInput | The name box that replaces a row's title while it is being renamed. |
| 7131 | focusRename | Put the caret in the name box, with the whole name selected the first time |
| 7155 | beginRename | Start renaming the selected conversation. |
| 7164 | cancelRename | Drop the edit and repaint the row as it was. |
| 7178 | commitRename | Hand the typed name to the host. |
| 7215 | renameSession | Rename one conversation, the way the shell's own sidebar does it: retain |
| 7265 | archiveSession | Archive the selected conversation, through the host's own action. |
| 7305 | archiveFailureText | A reason from whatever the host rejected an archive with. |
| 7326 | archiveSelected | Archive the selected row, with the footer saying what happened. |
| 7347 | failureText | A short reason from whatever the host rejected with: a remote failure |
| 7359 | setPaletteNotice | Say something in the footer. The next repaint restores the hint, so a |
| 7374 | resetPaintScratch | Put this repaint's measurements away, ready for the next one. |
| 7390 | renderPalette | Repaint the list from `PALETTE.sections`; cheap enough at this size. |
| 7461 | moreReachable | Whether the "More" seat has anything left to give. |
| 7478 | buildSectionHeader | One block heading. It is not selectable and not a row: it names the block |
| 7522 | scrollSelectionIntoView | Keep the cursor visible when the list is longer than the panel. |
| 7536 | moreHeadingNode | The "More" heading element currently on screen, or null. |
| 7562 | refreshPalette | Re-read both feeds, holding the selection on the same conversation and |
| 7608 | selectedRow | The conversation under the cursor, or null when the cursor is standing on |
| 7624 | moreSeatAt | Where the "More" seat stands in the row order, as a row index. |
| 7647 | moveSelection | Move the selection, wrapping at both ends. |
| 7691 | activateSelection | Act on whatever the selection is standing on. |
| 7703 | openPalette | Mount the window and read the feed. Rolling state is torn down first: |
| 7815 | closePalette | Unmount the window and drop every feed subscription. |
| 7875 | paletteKeyDown | Route one keystroke to the open window. |
| 7999 | composerRoot | The message box: the rich-text editor root the shell puts the caret into. |
| 8016 | rememberComposer | Remember the element a focus landed on. It is the fallback for a host |
| 8033 | isComposerEditor | True when an element is a rich-text editor, i.e. the message box — and |
| 8049 | noteFocusRequest | Mark that the user just asked for the keyboard themselves, so the focus |
| 8068 | clearFocusRequest | Drop a request the user has just superseded by doing something else. |
| 8083 | isActivating | True for a control a bare Space activates by itself. Such a control keeps |
| 8096 | focusComposer | Put the keyboard in the message box: what the focus key is for. |
| 8121 | composerIsEmpty | True when the message box holds nothing the user put there. |
| 8144 | leaveEmptyComposer | The focus key pressed again, inside the box it put the caret in: hand the |
| 8172 | inComposer | True when a keystroke was aimed at the message box. |
| 8195 | menuOpen | True while a suggestion menu is waiting to be confirmed. |
| 8224 | onSendKey | True when this keystroke is a send, and the keyboard should not stay in |
| 8253 | doubleEnterSends | True when this Enter is the second half of a double-Enter send. |
| 8283 | sendFromComposer | Send the draft by handing the host the key it already sends with. |
| 8334 | handBackAfterSend | Give the keyboard back to the page after a send, without waiting for a |
| 8365 | breakLine | Turn a bare Enter into the host's own line break. |
| 8419 | onFocusIn | Keep the message box from taking the keyboard on its own. |
| 8445 | noteFocusReturn | Widen the licence to a focus arriving right after the window got the |
| 8457 | justReturned | Whether a focus arriving now is the tail of the window coming back. |
| 8469 | onPointerDown | A press says where the keyboard should be: inside a text field it asks |
| 8494 | dismissOutsidePress | Put an open window away when the press landed beside it. |
| 8520 | pressMissesWindow | Whether a press landed outside an open window's card. |
| 8532 | activateSession | Switch the main view to one conversation. |
| 8588 | reportStoreFull | Say that the board could not be written, once. |
| 8595 | makeBoardStore | } |
| 9984 | makeHistory | The board's history: what was done, and how to put it back. |
| 10108 | makeNoteStore | The lines pinned to conversations, and the only thing that touches them. |
| 10249 | makeHistoryStore | The history's own store: one record per local day, in IndexedDB. |
| 10430 | makeJournal | The sessions a day inherited, kept where a repaint can reach them. |
| 10605 | makeCarryStore | } |
| 10700 | dayOf | The local day a moment belongs to, as `YYYY-MM-DD`. |
| 10709 | daysBetween | How many local days lie between two `YYYY-MM-DD` days. |
| 10719 | readMoment | The page the board last drew, as it was left, or null. |
| 10733 | forgetMoment | Forget the page that was left, once it has been filed. |
| 10757 | noteMoment | Remember the page this repaint draws. |
| 10781 | momentHeld | Whether the store still holds exactly the bytes this page last wrote. |
| 10800 | pageDoc | The arrangement a day's page keeps. |
| 10826 | pageView | The page as it reads, frozen. |
| 10876 | settleDay | File the page that was left, and start today. |
| 10911 | filePage | Write one page, and keep the history's size honest. |
| 10944 | settleCarry | Carry the members of the page just filed into today. |
| 10961 | pruneHistory | Keep the newest `snapshotKeepDays` pages, and no more. |
| 10979 | dropCarried | Let go of the conversations carried longest with no movement. |
| 11007 | maybeShowSeal | Show the day that just ended, once, the first time the board is up after it. |
| 11029 | sealCounts | The counts one day's summary reads off. |
| 11050 | sealLeft | What the desk still owes the reader, as of this press. |
| 11079 | paintSeal | Draw one day's summary. |
| 11155 | closeSeal | Take the day's summary down. |
| 11166 | historySearchRow | The one-line search above the days. |
| 11199 | searchHistory | Find a sentence across the pages, newest first. |
| 11241 | historyMatches | The lines of one page that carry the needle: its cards, its notes, its names. |
| 11269 | historyHitRow | One page a search found, with the lines it was found by. |
| 11307 | openBoardHistory | Open the history: the pages the board has been. |
| 11380 | closeBoardHistory | Take the history panel down, whichever page it was showing. |
| 11402 | renderHistory | Draw the list of days. |
| 11429 | historyNote | One quiet sentence where a page would be. |
| 11437 | historyMeta | How a page reads at a glance: what it was made of. |
| 11448 | historyDayRow | One day in the list, and its page once it is opened. |
| 11476 | historyDetail | One day's page, as it read: its goals, their conversations, its cards. |
| 11602 | restoreDay | Copy one page into today. |
| 11627 | applyPageOrder | Put the page's own arrangement back onto the panels. |
| 11645 | settleRestoredCarry | Seat a restored page's members as today's carried set. |
| 11659 | keepBackup | Keep what a restore or an import is about to replace. |
| 11672 | takeBeforeBackup | Take back what the last restore or import replaced. |
| 11690 | downloadJson | Hand a file to the browser. |
| 11724 | exportHistory | Write the board, its notes and every page into one file. |
| 11755 | pickHistoryFile | Ask for one file, and take it in when it arrives. |
| 11790 | importHistory | Take in one exported file. |
| 11835 | toggleBoard | The board the plugin opens when a page is not available. |
| 11848 | showBoard | } |
| 11874 | pointInSelection | Whether one right press landed inside the words the reader selected. |
| 11915 | onContextMenu | The way back from a conversation: a right press on its page. |
| 11935 | beginBoardNote | Start typing the line on one card. |
| 11948 | commitBoardNote | Keep what the open field says, and close it. |
| 11963 | cancelBoardNote | Throw the open field away, leaving the card as it was. |
| 11979 | openNote | The note key: open the board on the conversation on screen, with its |
| 12016 | pinToBoard | Put one conversation on the board by hand. |
| 12042 | startOfToday | Midnight today, in the reader's own zone. |
| 12076 | goalByKey | The canvas as it is drawn: one block per workspace in play, the |
| 12102 | nextGoalName | The name a goal cut from a card starts with: the one it came from, plus |
| 12114 | boardBlocks | } |
| 12269 | rememberFork | Record a fork this plugin watched, and repaint a board that is up. |
| 12293 | inheritForkHome | File a branch in the goal its parent is in. |
| 12316 | revealBoardCard | Bring one card into view, without moving the paper any further than it |
| 12339 | watchForks | Watch the sessions service for forks, so a branch made anywhere in the |
| 12379 | boardPlaces | The places the blocks will be drawn at. |
| 12409 | firstFreeSlot | The first place on the paper no block already stands on. |
| 12441 | slotTaken | Whether a block already stands on a place. |
| 12467 | boardPanelHeights | How tall each painted panel stands, keyed by the block it is. |
| 12488 | boardPanelWidths | How wide each painted panel stands, keyed by the block it is. |
| 12514 | boardExtent | How big the stage has to be to hold everything on it. |
| 12542 | applyBoardZoom | Put the canvas's magnification on the paper. |
| 12565 | setBoardZoom | Zoom the canvas, keeping one point of it where it is on screen. |
| 12587 | onBoardWheel | Ctrl/Cmd + wheel zooms the canvas, the way every canvas does. |
| 12607 | nextCardPlace | Where a new loose card goes when the reader did not point at a place. |
| 12638 | boardFreePlace | A place on the paper for a goal that was just asked for, near the eye. |
| 12681 | addBoardGoal | Stand a new goal on the canvas, ready to be given a purpose. |
| 12703 | closeNewSessionSheet | Take the new-conversation sheet down, and forget what it was writing. |
| 12728 | paintNewSessionBusy | Put the sheet's confirm button in step with the one host round trip. |
| 12744 | paintNewSessionModel | Say which model the sheet would start the conversation on. |
| 12768 | paintNewSessionField | Paint one of the sheet's fields as focused or not. |
| 12779 | watchNewSessionField | Let a field say where the caret is, for as long as it lives. |
| 12794 | openNewSessionSheet | Show the sheet that asks for a conversation's name and the words it opens with. |
| 13003 | commitNewSessionSheet | Read the sheet and start the conversation it describes. |
| 13037 | applyNewSessionModel | Put the model the sheet was set to onto the conversation just made. |
| 13079 | startNewSessionForGoal | Start one conversation under one goal, with the reader's words. |
| 13181 | tidyPanels | The panels as a tidy sees them: a rectangle of paper, the conversations |
| 13252 | tidyHomeOf | Which panel a card belongs beside, if any. |
| 13277 | tidyColumnX | The first x at or right of `x` that no panel already stands in. |
| 13295 | tidyBySession | The order cards stand in beside their panel: the panel's own order. |
| 13301 | tidyByTray | The order the inbox tray keeps: what is finished sinks to the bottom. |
| 13321 | tidyGroup | Lay one group of cards out as a column beside its panel. |
| 13384 | tidyPlan | Where every idea card belongs, as a list of places and a list of put-aways. |
| 13427 | tidyBoard | Tidy the canvas: put every idea card where it belongs, and leave the |
| 13479 | glideTidyBatch | Fly one tidy's cards to their places, a beat apart. |
| 13537 | openBoard | Mount the board. |
| 13586 | mountBoardInto | Build the board's parts into a root element, whichever mount owns it. |
| 13846 | unmountBoard | Unmount the board, whichever mount holds it. |
| 13947 | closeBoard | Take the floating board down, element and all. |
| 13974 | boardFieldOpen | Repaint the whole canvas from the feeds. |
| 14000 | renderBoard | } |
| 14209 | boardStatusFingerprint | The board's reading of every card's status, as one string. |
| 14230 | renderBoardOnStatus | Repaint the board for a status tick, but only if something on screen |
| 14245 | tickBoardClocks | Move the running cards' minute hands, in place. |
| 14268 | startDayTimer | Arm the one timer that watches for midnight. |
| 14283 | stopDayTimer | Stop the midnight timer: the board closed, or the page went away. |
| 14290 | startBoardClock | Start the tick that keeps the board's clocks honest. |
| 14301 | stopBoardClock | Stop the tick: the board closed, or nothing on it is running. |
| 14315 | requestBoardTurns | Ask for the turn counts the board is missing. |
| 14345 | paintHistory | Paint the "only what is marked" toggle to match the state it stands for. |
| 14360 | paintBoardStarFilter | } |
| 14377 | slotHue | One workspace on the canvas: a heading that can be dragged, and the |
| 14390 | slotSeed | Which seat a block starts on: its own id, never its name. |
| 14407 | boardSlots | Give every panel on this paint its own slice of the wheel. |
| 14424 | blockSeat | The seat one block wears, whether or not this paint gave it one. |
| 14431 | blockInk | The colour one panel's own mark wears. |
| 14448 | noteHue | The paper one note is written on. |
| 14452 | notePaper | } |
| 14475 | noteInkOf | The ink one note is drawn in. |
| 14575 | boardIcon | One of those glyphs, at a size, as an element. |
| 14632 | boardNoteCols | How many rows an idea card's field needs for what it holds. |
| 14638 | boardTextRows | } |
| 14663 | boardEditorRows | The lines a card's field opens on. |
| 14691 | boardNoteMetrics | How much paper one idea card takes. |
| 14725 | noteParts | How much paper one idea card takes: its heading, and the lines it holds. |
| 14745 | boardCardBox | How much paper one idea card takes at rest. |
| 14771 | boardCardOpenBox | The paper a note takes while its field is up: all of its body, up to the cap. |
| 14793 | canvasPointOf | Where a point on the screen falls on the paper. |
| 14815 | raiseBoardCard | Bring one card to the front of the paper. |
| 14835 | beginNoteLift | Lift one put-away note out of the tray, under the hand. |
| 14885 | markDropGoal | Say which goal would take the card if the hand let go of it here. |
| 14900 | boardHomeOf | The goal one conversation is drawn in on this paint, or null. |
| 14922 | markNoDrop | Say, under the hand, that the paper will not take this card. |
| 14948 | dropNoDropTip | Take the "the paper will not take it" line off the page. |
| 14967 | goalNodeAt | The goal panel under a native drag, asked in the order a browser answers. |
| 14979 | nearestGoal | The goal panel an element stands in, or null when it stands in none. |
| 14995 | goalUnder | The goal the pointer is standing in, as the id a card is filed under. |
| 15011 | goalHeadKeyUnder | The goal whose heading an element stands in, as the key a card starts a |
| 15036 | boardDragHasText | Whether a native drag carries words, the one thing the shell's rows set. |
| 15074 | sessionInPayload | The words a native drag is carrying, read where the browser allows it. |
| 15101 | boardDragText | } |
| 15119 | clearBoardDragGoal | Take the goal highlight a native drag drew off the paper. |
| 15136 | onNativeDragEnd | A native drag is over, however it ended. |
| 15150 | onBoardDragOver | Say, while a native drag is over the canvas, which goal would take it. |
| 15166 | onBoardDragLeave | The native drag left the canvas: take the goal highlight with it. |
| 15186 | onBoardDrop | A conversation let go on the canvas, carried in from the host's sidebar. |
| 15213 | dropSessionOntoBoard | Take one conversation the reader dragged in, and keep it. |
| 15229 | buildBoardBlock | } |
| 15528 | trayCaption | The conversations of one block, cut into threads. |
| 15543 | trayQuiet | A quiet line where a section has nothing in it yet. |
| 15561 | buildTrayNote | One note, as a line of the tray. |
| 15709 | trayInk | Ink every conversation inside one node with the tray's paper. |
| 15721 | doneBinCards | Every note put away in the finished-cards bin, newest first. |
| 15726 | doneBinCardsOf | The put-away notes one conversation was handed, newest first. |
| 15745 | openDoneBinFor | Open the bin on one conversation's own put-aways. |
| 15760 | paintDoneBin | Say how many cards the bin holds, and what it is doing. |
| 15775 | toggleDoneBin | Open or close the finished-cards list. |
| 15793 | buildDoneRow | One finished note, as a line of the card's list. |
| 15880 | mountDoneBin | Put the finished-cards list on the board, or take it away. |
| 15968 | ejectFromDoneBin | Put one card back on the paper, out of the finished-cards bin. |
| 15987 | buildInboxBody | The tray's body: the conversations nothing accounts for, and the notes put away here. |
| 16032 | boardBlockColumns | How many columns a panel reads across. |
| 16048 | boardCardStacked | Whether one card is drawn inside a conversation's column. |
| 16071 | boardBlockWidth | How wide a panel stands. |
| 16095 | buildBoardColumns | A goal's conversations, laid out across the panel. |
| 16148 | buildQuietStrip | The conversations a panel carried in and nobody has touched, one line each. |
| 16204 | buildQuietRow | One quiet conversation, as the line it is drawn as. |
| 16276 | buildQuietStack | The thoughts under one quiet conversation, once its count was pressed. |
| 16295 | buildBoardStack | The thoughts filed under one conversation. |
| 16361 | markCardFresh | Wear the one beat a completion is worth - once. |
| 16392 | buildBoardCard | One conversation on the board: its name, what it is doing, and the |
| 16832 | beginBlockRename | Start typing a goal's name into its heading. |
| 16838 | commitBlockRename | Keep the name the heading says, and close the field. |
| 16850 | cancelBlockRename | Throw the typed name away, leaving the goal as it was called. |
| 16867 | goalBaseName | The last piece of a workspace path: what the workspace is called. |
| 16880 | beginGoalIntent | Start writing what a goal is for. |
| 16895 | commitGoalIntent | Keep what the open line says, and close it. |
| 16907 | cancelGoalIntent | Throw the typed line away, leaving the goal as it was. |
| 16926 | removeBoardGoal | Take one goal off the canvas, with a few seconds to bring it back. |
| 16973 | boardNameCollisions | Which drawn cards share a name, and where each one stands in its group. |
| 16999 | boardTitleOf | The name one card wears: the reader's word while the shell catches up, |
| 17015 | noteCardTitle | Put the reader's word on a card before the shell has answered. |
| 17030 | settleTitles | Let go of the stand-in names the feed has caught up with, or outlived. |
| 17049 | beginBoardRename | Start renaming one conversation from its card. |
| 17067 | commitBoardRename | Keep what the open name field says, and rename the conversation. |
| 17106 | cancelBoardRename | Throw the open name field away, leaving the conversation as it was. |
| 17125 | forkBoardCard | Start a branch from one conversation, and draw the line when it lands. |
| 17171 | returnForkMark | Let a conversation's branch mark answer again, and say so on the card. |
| 17187 | waitForBranchRow | The catalogue row for one conversation, asked for until it arrives. |
| 17219 | settleBranchName | Give a fresh branch a name nobody else is using, and answer with it. |
| 17262 | pasteIntoComposer | Put words in the message box of the conversation on screen. |
| 17296 | composerHasText | Whether the message box already holds something. |
| 17312 | boxHasText | Whether one box already holds words. |
| 17327 | seatCaretAtEnd | Put the caret at the end of the box's content. |
| 17366 | dropCardIntoComposer | Hand one loose card's words to a conversation's message box. |
| 17386 | pasteIntoBoxNow | Put the words in the box that is on screen right now, if there is one. |
| 17408 | putThroughEditor | Put text into the editor through the editing command. |
| 17427 | pasteThroughEvent | Put text into the editor as a real paste event. |
| 17466 | buildIdeaMenu | One loose card: a thought the reader put on the canvas rather than in a |
| 17502 | ideaMenuItem | One line of that menu. |
| 17531 | buildSessionMenu | The verbs on a conversation card that are not worth a seat of their own. |
| 17562 | placeCardMenu | One line of that menu. |
| 17579 | cardMenuItem | } |
| 17607 | buildBoardLooseCard | } |
| 17953 | boardJoinText | Join a card's two parts back into the one string the store keeps. |
| 17972 | beginBoardCard | Start typing into one loose card - at its title, or at its body. |
| 18012 | boardTakeCardText | Keep what the open field says, and close it. |
| 18029 | commitBoardCard | } |
| 18042 | cancelBoardCard | Throw the open field away, leaving the card as it was last written. |
| 18063 | settleBoardCardForPress | Settle the open card field for a press, without the paint a settle |
| 18080 | addBoardCardAt | Write a new card at a place, and start typing in it. |
| 18102 | addBoardCard | Write a new card where the reader is looking, or below everything when the |
| 18119 | removeLooseCard | Take one loose card off the canvas. |
| 18164 | removeBoardCard | Take one conversation off the board. |
| 18206 | handleOf | A press on a block's heading: the handle the panel is dragged by. |
| 18235 | beginStackedCarrier | Lift one card out of a conversation's column, where the hand is. |
| 18274 | stackCardBefore | The card a drop should sit above, from where the pointer let go. |
| 18302 | closeIdeaMenu | Mark the column the hand is over, or clear every mark. |
| 18319 | closeSessionMenu | Put a conversation card's menu away, without a repaint. |
| 18335 | paintStackDrop | } |
| 18353 | paintHeadDrop | Light the heading of the goal a carried card would start a conversation in. |
| 18372 | parkCardOutside | Give a card lifted out of a column a place on the paper. |
| 18399 | boardPointerDown | The one press handler on the canvas. |
| 18545 | boardNoteDone | Put the drop bands on screen, or take them away. |
| 18553 | showDropZones | } |
| 18568 | boardListen | Start listening for the rest of a gesture, once it has been armed. |
| 18585 | beginSessionGrab | Start a session drag: a sort inside its own panel, a carry outside it. |
| 18603 | beginSessionReorder | Sort one conversation among its neighbours, where the hand is. |
| 18658 | paintSessionReorder | Follow the hand, and let the other columns make room as it passes them. |
| 18685 | leaveSessionReorder | Hand the drag back to the carrier, because the pointer left the panel. |
| 18698 | resetSessionReorder | Put every column back where the paint left it. |
| 18719 | commitSessionReorder | Write the order the hand chose, once, and draw it. |
| 18749 | beginSessionCarrier | Give a carried card its body, where the hand is. |
| 18791 | onBoardMove | Follow the pointer: pan the paper, or carry what the hand picked up. |
| 18903 | onBoardUp | Let go: write down what the gesture decided, unless it never moved. |
| 19126 | handCardToSession | Hand one loose card's words to a conversation, and leave a trace behind. |
| 19152 | nameSessionForCard | Let the conversation a card was handed to wear the card's own name. |
| 19182 | drawCardLinks | Draw the elbow from every branch back to the conversation it was cut from. |
| 19238 | cancelBoardDrag | Drop the gesture and put back what it was carrying. |
| 19248 | endBoardDrag | Take the gesture's furniture off the page and forget it. |
| 19290 | onBoardBlurDrag | The window losing focus mid-gesture: the pointer left with it. |
| 19305 | onBoardDoubleClick | A double click on the paper: write a card right there. |
| 19351 | makeNotice | The transient line the plugin speaks in. |
| 19574 | showToast | Say one thing for a moment. A second press replaces the line and restarts |
| 19579 | hideToast | Take the notice down and drop the pending timer. |
| 19593 | SendHintLine | The line that names the send key, contributed to the shell's own dock row |
| 19625 | sendKeyLabel | The modifier this machine's send accelerator lives on, named the way the |
| 19644 | modelDirectories | The host's session model-selection service, when it publishes one. |
| 19660 | effortLevels | The reasoning levels one model offers, in the order the composer's own |
| 19684 | levelIndex | Where one level sits in the list. An explicit selection wins; without one |
| 19705 | currentLevelId | The level in effect for one selection, read the way the composer's own |
| 19716 | isCurrentEntry | Whether one entry is the model the conversation is already on. |
| 19734 | rowMarkedLevel | The level one picker row shows as marked, which is the level it would end |
| 19754 | rowSubmitLevel | The level one picker row would submit if it were confirmed without the |
| 19767 | refusal | A refusal this plugin can explain on its own, so the notice carries |
| 19786 | cycleEffort | One press of the reasoning key: step the visible conversation's level one |
| 19820 | stepEffort | Read the levels off one session directory and submit the next one. |
| 19870 | catalogGroups | Every provider/model the host currently advertises, for the settings page. |
| 19908 | groupsOf | The provider groups out of one loaded catalog or directory snapshot. Both |
| 19926 | offeredModels | The catalog as a lookup, one entry per `provider/model`. |
| 19964 | modelEntries | The configured models the directory currently offers, in the order the |
| 19976 | modelIndex | Where one model sits in the list; -1 when it is not one of them. |
| 19993 | modelDirectoryOfCurrent | Resolve the model directory behind the conversation on screen. |
| 20024 | readModelList | Read the list off one session directory. |
| 20068 | readNewSessionModelList | The list the sheet's model row offers. |
| 20091 | openNewSessionModelPick | Open the model window for the sheet's model row. |
| 20131 | openModelPick | One press of the model key: open the picker on the list of models the |
| 20343 | modelPickHint | The line under the picker: what it is showing, and what the keys do. |
| 20372 | renderModelPick | Repaint the picker's rows and footer from `MODELPICK.entries`. |
| 20395 | markedLevel | The level one row is currently marked with. |
| 20410 | confirmLevel | The level one confirm would submit. |
| 20433 | buildModelRow | One row of the picker: the model's name with the `current` tag in front of |
| 20488 | buildLevelCell | The levels of one model. |
| 20541 | levelClickHandler | The press handler for one level chip. |
| 20555 | keepModelPickVisible | Keep the selected row in sight when the list is longer than the card. |
| 20577 | openModelWindow | Mount the picker, with the selection already on the model in effect. |
| 20643 | closeModelPick | Unmount the picker and forget everything it was showing. |
| 20679 | moveModelPick | Move the picker's selection, wrapping at both ends. |
| 20707 | moveModelPickEntry | Put the selected model somewhere else in the list, and remember it there. |
| 20747 | reorderFavorites | Put an ordered list of pairs back into the configured one, in the new |
| 20775 | stepModelPickLevel | Step the level of the selected row, wrapping at both ends. |
| 20804 | confirmModelPick | Confirm the selected row: submit its model at its marked level, then take |
| 20869 | modelToast | The one-line notice after a switch, naming the level when the row has one. |
| 20881 | levelName | The readable name of one level of one model, or null when there is none. |
| 20903 | modelPickKeyDown | Route one keystroke to the open picker. |
| 20981 | switchModel | Read the catalog off one session directory and submit the model and level |
| 21082 | makeTranslator | Translate through the locale seat when it is wired, else through the |
| 21098 | KeyRow | One rebindable key: focus the box, press the key you want. |
| 21138 | SliderRow | One numeric preference. |
| 21168 | ChoiceRow | A short set of mutually exclusive options, as a row of toggles. Used for |
| 21214 | ModelListGroup | The switchable models as one settings group: what is chosen, in the order |
| 21407 | VimSection | The whole Settings → Vim scrolling page. |
| 21647 | BoardPage | The board as the main panel's page. |
| 21682 | BoardPanelIcon | The sidebar entry's glyph: three columns, which is what the board is. |
| 21727 | installBoardPage | Contribute the board as a sidebar entry and a main panel. |
| 21786 | installWindowCSS | The rules every window this plugin mounts shares, once. |
| 21830 | installBoardCSS | Put the board's hover and motion rules on the page, once. |
| 21995 | installSettings | Contribute the settings page and its vocabulary. Both contributions are |
| 22071 | makeApi | Debug and tuning surface, also used by tools/selftest.mjs. |
| 22405 | apply | Client activation. |
