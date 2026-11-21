# MAP - lib/client.js

由 `npm run map` 生成，不要手改。找一个功能的入口：先在这里按名字查到行号，再读那一段。

lib/client.js：22767 行，453 个顶层函数。

| 行 | 函数 | 上方注释 |
|---:|---|---|
| 1267 | localeIsZh | Best-effort locale guess, used for the nav label and fallback strings. |
| 1291 | defaults | Shipped defaults as a fresh object, derived from DEFAULTS so a new |
| 1301 | copy | Current preferences as a fresh object. |
| 1325 | isBindableKey | A single printable character, or one of `NAMED_KEYS`, is the only thing |
| 1341 | normalizeKey | Normalise a bound key to its stored form: lower case for characters, |
| 1357 | keyLabel | How a bound key reads in the settings box. A space is invisible in a box |
| 1364 | clampNumber | Clamp a numeric preference to its accepted range. |
| 1380 | sanitizeFavorites | The switchable models as a fresh list of `{provider, model}` pairs. |
| 1399 | persist | Persist the current preferences; storage failures are not fatal. |
| 1408 | announce | Notify the settings page that preferences changed. |
| 1423 | applyPatch | Validate and apply one patch. Rejected patches leave preferences intact. |
| 1497 | firstFree | The preferred key when it is free, else the first free letter. |
| 1517 | repairKeys | Force each key group to be conflict-free. Groups are repaired back to |
| 1581 | migrateArchiveSeat | Move the archive seat into place for a store written before it existed. |
| 1597 | load | Read stored preferences over the defaults. |
| 1650 | setStage | Mark one conversation, or take the mark off it, and repaint. |
| 1667 | stageHandler | The press handler for one stage word on one row. |
| 1684 | cyclePhase | Advance one conversation to the next stage, and repaint the window. |
| 1695 | subscribe | Subscribe to preference changes. |
| 1732 | isEditable | True when the element consumes printable characters itself. |
| 1746 | isScrollable | True when the element is a non-editable box that overflows vertically and |
| 1759 | parentOf | Parent element, crossing shadow boundaries through the host node. |
| 1770 | scrollerFrom | Nearest scrollable ancestor, inclusive. |
| 1780 | largestScroller | Largest visible scroll container; the last-resort target. |
| 1803 | elementAt | The topmost element at a point, when the document can be asked. A host |
| 1824 | pickScroller | Choose the container to scroll. Deterministic order: whatever sits under |
| 1848 | canMove | Whether the container still has room in the requested direction. |
| 1860 | resolveTarget | Walk from the picked container up to the first one that can move. This is |
| 1870 | reducedMotion | Honour the OS "reduce motion" preference. |
| 1880 | suppressSmooth | Pin `scroll-behavior: auto` for the animated element. Without this, a |
| 1889 | stopAnim | Stop the animation loop and restore anything it changed. |
| 1906 | frame | One animation frame: ease `current` toward `target`, frame-rate |
| 1932 | push | Queue a scroll step. Resolves (or reuses) the container, extends the |
| 1959 | stopHold | Cancel the held-key auto-repeat. |
| 1971 | tickHold | Auto-repeat tick: one more step, then schedule the next sooner. |
| 1992 | startHold | Start a hold: one immediate step, then our own accelerating repeat. The |
| 2009 | directionOf | Which direction a pressed key drives, if any. |
| 2024 | onKeyDown | Capture-phase key handler. Runs before the app's own handlers so the |
| 2396 | onKeyUp | Any keyup ends the hold, so a dropped keyup cannot leave the view scrolling. |
| 2422 | onEscapeBlur | Escape leaves a focused composer, so the scroll keys come back. |
| 2447 | onPointerMove | Remember where the pointer is. |
| 2468 | forgetPointer | Forget the remembered pointer, so the focus and centre rules decide again. |
| 2473 | onUserScroll | The user took over with the wheel or a touch: abandon our animation. |
| 2489 | onFocusLoss | Losing the window or the tab must not leave a hold or a stale pointer |
| 2932 | makeTurnPeek | The ledger behind `TURNS`, and the only thing that touches it. |
| 3056 | makePhaseLedger | The ledger behind `PHASES_MODEL`, and the only thing that touches the |
| 3171 | makeRunLedger | The ledger behind `RUNS`, and the only thing that touches it. |
| 5567 | applyBoardPageInk | Paint the page with the host's theme. |
| 5619 | sizePanel | Fit the panel to the configured size. |
| 5632 | placementMargin | How far the panel is held off the edge it is parked against. |
| 5644 | placePanel | Park the panel according to the configured position. The one place that |
| 5672 | serviceOf | One host service, however this context publishes it. These two are read |
| 5691 | taskServices | The session feed, the workspace registry, and the workspace navigator. |
| 5720 | statusFor | The shell's unified status entry for one conversation, if it publishes one. |
| 5737 | currentSession | The conversation on screen, as the shell's own shortcuts see it: the one |
| 5757 | currentSessionRunning | True when the conversation on screen has a turn in flight. |
| 5775 | statusOf | What one conversation is doing right now, as a short label. |
| 5795 | turnsOf | The turn count already peeked for a conversation, or null. |
| 5805 | statusIsLive | True for the statuses that mean a turn is in flight: one that is running, |
| 5833 | noteDeliveries | Note the turn ends: a conversation this page watched run, no longer running. |
| 5859 | syncRuns | } |
| 5876 | watchRuns | Follow the status source for the life of the page, so a turn is stamped |
| 5899 | loadRunStamps | Read the stamps the previous page left behind, dropping the ones that are |
| 5907 | forgetRuns | Stop watching, and forget every stamp the watch had taken. |
| 5916 | runSince | The moment the turn in flight in one conversation was seen to start. |
| 5932 | elapsedText | How long a turn has been in flight, at minute resolution. |
| 5950 | tickClocks | Repaint the live chips, in place. |
| 5980 | clockDelay | Milliseconds until the next whole minute of the oldest clock given. |
| 5991 | startClock | Start the tick that keeps the clocks on screen honest. |
| 6002 | stopClock | Stop the tick: the window closed, or nothing on screen is running. |
| 6040 | donePulseAmount | How far into the beat `progress` (0..1) is, as a 0..1 swell. |
| 6054 | paintDonePulse | Paint the beat on every "just finished" chip on screen. |
| 6070 | tickDonePulse | One frame of the beat; schedules the next, or puts the chips back. |
| 6094 | startDonePulse | Start the beat, unless there is nothing to point at or the OS asked for |
| 6102 | stopDonePulse | Cancel the beat and put every chip it touched back. |
| 6120 | requestTurns | Queue a turn count for every loaded row that does not have one yet. |
| 6133 | drainPeeks | Start as many queued peeks as the concurrency budget allows. |
| 6152 | peekTurns | Read one session's `sessionStats.turns` and let go of it again. |
| 6221 | cancelPeeks | Drop every queued and in-flight peek; the window closed or unloaded. |
| 6226 | paletteText | Built-in string for the task window; it is plugin chrome, not shell copy. |
| 6237 | relativeTime | Coarse "how long ago" for a row. Deliberately four buckets, so a list |
| 6248 | paletteHint | Footer hint, rebuilt from the live bindings and the current depth. |
| 6307 | paletteHeadline | The one line above the list: what is on the reader's plate right now. |
| 6337 | conversationPool | Every conversation worth offering, newest first. |
| 6384 | sortByRecency | Sort rows by recency, newest first, with the id as a deterministic |
| 6403 | hereIndex | Where the conversation on screen sits in a list, or 0 when it is not |
| 6429 | firstOwedIndex | Where the selection opens: the first thing waiting on the reader, else |
| 6462 | attentionOf | Which attention block a conversation belongs to, or null for the plain |
| 6506 | paletteBlocks | Split the pool into the attention blocks and the browsing blocks. |
| 6582 | waitedSince | How long a conversation has been waiting on the reader, as a stamp. |
| 6601 | revealMore | Reveal one more batch of older conversations. |
| 6646 | paletteSections | The blocks to draw, in order, each with its header. |
| 6685 | rebuildRows | Rebuild `rows` and `sections` from the two blocks. |
| 6711 | folderIndex | Which folder each conversation lives in, as `{ label, path }` keyed by |
| 6748 | folderById | One workspace, by the id the board files its goals under. |
| 6780 | workspaceForGoal | The workspace a new conversation started from one goal would join. |
| 6809 | boardBlockByKey | One goal of the last paint, by the key a card is filed under. |
| 6823 | folderLabel | What a folder reads as on a row: the Workspace's own title, else the last |
| 6855 | rowColumns | The row grid: the state chip, the name, and the metadata — tag, stage, |
| 6875 | columnOf | The grid column one cell belongs to, on this repaint. |
| 6888 | widestCell | The widest content width among one column's cells. |
| 6914 | fitColumns | Give every row the same tracks, sized to what is actually on screen. |
| 6946 | namesOwnFolder | Whether a row in this block has to name its own folder. |
| 6958 | buildRow | One list row. Clicking it switches, so the window is not keyboard-only. |
| 7142 | buildRenameInput | The name box that replaces a row's title while it is being renamed. |
| 7177 | focusRename | Put the caret in the name box, with the whole name selected the first time |
| 7201 | beginRename | Start renaming the selected conversation. |
| 7210 | cancelRename | Drop the edit and repaint the row as it was. |
| 7224 | commitRename | Hand the typed name to the host. |
| 7261 | renameSession | Rename one conversation, the way the shell's own sidebar does it: retain |
| 7311 | archiveSession | Archive the selected conversation, through the host's own action. |
| 7351 | archiveFailureText | A reason from whatever the host rejected an archive with. |
| 7372 | archiveSelected | Archive the selected row, with the footer saying what happened. |
| 7393 | failureText | A short reason from whatever the host rejected with: a remote failure |
| 7405 | setPaletteNotice | Say something in the footer. The next repaint restores the hint, so a |
| 7420 | resetPaintScratch | Put this repaint's measurements away, ready for the next one. |
| 7436 | renderPalette | Repaint the list from `PALETTE.sections`; cheap enough at this size. |
| 7507 | moreReachable | Whether the "More" seat has anything left to give. |
| 7524 | buildSectionHeader | One block heading. It is not selectable and not a row: it names the block |
| 7568 | scrollSelectionIntoView | Keep the cursor visible when the list is longer than the panel. |
| 7582 | moreHeadingNode | The "More" heading element currently on screen, or null. |
| 7608 | refreshPalette | Re-read both feeds, holding the selection on the same conversation and |
| 7654 | selectedRow | The conversation under the cursor, or null when the cursor is standing on |
| 7670 | moreSeatAt | Where the "More" seat stands in the row order, as a row index. |
| 7693 | moveSelection | Move the selection, wrapping at both ends. |
| 7737 | activateSelection | Act on whatever the selection is standing on. |
| 7749 | openPalette | Mount the window and read the feed. Rolling state is torn down first: |
| 7861 | closePalette | Unmount the window and drop every feed subscription. |
| 7921 | paletteKeyDown | Route one keystroke to the open window. |
| 8045 | composerRoot | The message box: the rich-text editor root the shell puts the caret into. |
| 8062 | rememberComposer | Remember the element a focus landed on. It is the fallback for a host |
| 8079 | isComposerEditor | True when an element is a rich-text editor, i.e. the message box — and |
| 8095 | noteFocusRequest | Mark that the user just asked for the keyboard themselves, so the focus |
| 8114 | clearFocusRequest | Drop a request the user has just superseded by doing something else. |
| 8129 | isActivating | True for a control a bare Space activates by itself. Such a control keeps |
| 8142 | focusComposer | Put the keyboard in the message box: what the focus key is for. |
| 8167 | composerIsEmpty | True when the message box holds nothing the user put there. |
| 8190 | leaveEmptyComposer | The focus key pressed again, inside the box it put the caret in: hand the |
| 8218 | inComposer | True when a keystroke was aimed at the message box. |
| 8241 | menuOpen | True while a suggestion menu is waiting to be confirmed. |
| 8270 | onSendKey | True when this keystroke is a send, and the keyboard should not stay in |
| 8299 | doubleEnterSends | True when this Enter is the second half of a double-Enter send. |
| 8329 | sendFromComposer | Send the draft by handing the host the key it already sends with. |
| 8380 | handBackAfterSend | Give the keyboard back to the page after a send, without waiting for a |
| 8411 | breakLine | Turn a bare Enter into the host's own line break. |
| 8465 | onFocusIn | Keep the message box from taking the keyboard on its own. |
| 8491 | noteFocusReturn | Widen the licence to a focus arriving right after the window got the |
| 8503 | justReturned | Whether a focus arriving now is the tail of the window coming back. |
| 8515 | onPointerDown | A press says where the keyboard should be: inside a text field it asks |
| 8540 | dismissOutsidePress | Put an open window away when the press landed beside it. |
| 8566 | pressMissesWindow | Whether a press landed outside an open window's card. |
| 8578 | activateSession | Switch the main view to one conversation. |
| 8634 | reportStoreFull | Say that the board could not be written, once. |
| 8641 | makeBoardStore | } |
| 10089 | makeHistory | The board's history: what was done, and how to put it back. |
| 10213 | makeNoteStore | The lines pinned to conversations, and the only thing that touches them. |
| 10354 | makeHistoryStore | The history's own store: one record per local day, in IndexedDB. |
| 10535 | makeJournal | The sessions a day inherited, kept where a repaint can reach them. |
| 10710 | makeCarryStore | } |
| 10805 | dayOf | The local day a moment belongs to, as `YYYY-MM-DD`. |
| 10814 | daysBetween | How many local days lie between two `YYYY-MM-DD` days. |
| 10824 | readMoment | The page the board last drew, as it was left, or null. |
| 10838 | forgetMoment | Forget the page that was left, once it has been filed. |
| 10862 | noteMoment | Remember the page this repaint draws. |
| 10886 | momentHeld | Whether the store still holds exactly the bytes this page last wrote. |
| 10905 | pageDoc | The arrangement a day's page keeps. |
| 10931 | pageView | The page as it reads, frozen. |
| 10981 | settleDay | File the page that was left, and start today. |
| 11016 | filePage | Write one page, and keep the history's size honest. |
| 11049 | settleCarry | Carry the members of the page just filed into today. |
| 11066 | pruneHistory | Keep the newest `snapshotKeepDays` pages, and no more. |
| 11084 | dropCarried | Let go of the conversations carried longest with no movement. |
| 11112 | maybeShowSeal | Show the day that just ended, once, the first time the board is up after it. |
| 11134 | sealCounts | The counts one day's summary reads off. |
| 11155 | sealLeft | What the desk still owes the reader, as of this press. |
| 11184 | paintSeal | Draw one day's summary. |
| 11260 | closeSeal | Take the day's summary down. |
| 11271 | historySearchRow | The one-line search above the days. |
| 11304 | searchHistory | Find a sentence across the pages, newest first. |
| 11346 | historyMatches | The lines of one page that carry the needle: its cards, its notes, its names. |
| 11374 | historyHitRow | One page a search found, with the lines it was found by. |
| 11412 | openBoardHistory | Open the history: the pages the board has been. |
| 11485 | closeBoardHistory | Take the history panel down, whichever page it was showing. |
| 11507 | renderHistory | Draw the list of days. |
| 11534 | historyNote | One quiet sentence where a page would be. |
| 11542 | historyMeta | How a page reads at a glance: what it was made of. |
| 11553 | historyDayRow | One day in the list, and its page once it is opened. |
| 11581 | historyDetail | One day's page, as it read: its goals, their conversations, its cards. |
| 11707 | restoreDay | Copy one page into today. |
| 11732 | applyPageOrder | Put the page's own arrangement back onto the panels. |
| 11750 | settleRestoredCarry | Seat a restored page's members as today's carried set. |
| 11764 | keepBackup | Keep what a restore or an import is about to replace. |
| 11777 | takeBeforeBackup | Take back what the last restore or import replaced. |
| 11795 | downloadJson | Hand a file to the browser. |
| 11829 | exportHistory | Write the board, its notes and every page into one file. |
| 11860 | pickHistoryFile | Ask for one file, and take it in when it arrives. |
| 11895 | importHistory | Take in one exported file. |
| 11940 | toggleBoard | The board the plugin opens when a page is not available. |
| 11953 | showBoard | } |
| 11979 | pointInSelection | Whether one right press landed inside the words the reader selected. |
| 12020 | onContextMenu | The way back from a conversation: a right press on its page. |
| 12040 | beginBoardNote | Start typing the line on one card. |
| 12053 | commitBoardNote | Keep what the open field says, and close it. |
| 12068 | cancelBoardNote | Throw the open field away, leaving the card as it was. |
| 12084 | openNote | The note key: open the board on the conversation on screen, with its |
| 12121 | pinToBoard | Put one conversation on the board by hand. |
| 12147 | startOfToday | Midnight today, in the reader's own zone. |
| 12181 | goalByKey | The canvas as it is drawn: one block per workspace in play, the |
| 12207 | nextGoalName | The name a goal cut from a card starts with: the one it came from, plus |
| 12219 | boardBlocks | } |
| 12374 | rememberFork | Record a fork this plugin watched, and repaint a board that is up. |
| 12398 | inheritForkHome | File a branch in the goal its parent is in. |
| 12421 | revealBoardCard | Bring one card into view, without moving the paper any further than it |
| 12444 | watchForks | Watch the sessions service for forks, so a branch made anywhere in the |
| 12484 | boardPlaces | The places the blocks will be drawn at. |
| 12514 | firstFreeSlot | The first place on the paper no block already stands on. |
| 12546 | slotTaken | Whether a block already stands on a place. |
| 12572 | boardPanelHeights | How tall each painted panel stands, keyed by the block it is. |
| 12593 | boardPanelWidths | How wide each painted panel stands, keyed by the block it is. |
| 12619 | boardExtent | How big the stage has to be to hold everything on it. |
| 12647 | applyBoardZoom | Put the canvas's magnification on the paper. |
| 12670 | setBoardZoom | Zoom the canvas, keeping one point of it where it is on screen. |
| 12692 | onBoardWheel | Ctrl/Cmd + wheel zooms the canvas, the way every canvas does. |
| 12712 | nextCardPlace | Where a new loose card goes when the reader did not point at a place. |
| 12743 | boardFreePlace | A place on the paper for a goal that was just asked for, near the eye. |
| 12786 | addBoardGoal | Stand a new goal on the canvas, ready to be given a purpose. |
| 12808 | closeNewSessionSheet | Take the new-conversation sheet down, and forget what it was writing. |
| 12833 | paintNewSessionBusy | Put the sheet's confirm button in step with the one host round trip. |
| 12849 | paintNewSessionModel | Say which model the sheet would start the conversation on. |
| 12873 | paintNewSessionField | Paint one of the sheet's fields as focused or not. |
| 12884 | watchNewSessionField | Let a field say where the caret is, for as long as it lives. |
| 12899 | openNewSessionSheet | Show the sheet that asks for a conversation's name and the words it opens with. |
| 13108 | commitNewSessionSheet | Read the sheet and start the conversation it describes. |
| 13142 | applyNewSessionModel | Put the model the sheet was set to onto the conversation just made. |
| 13184 | startNewSessionForGoal | Start one conversation under one goal, with the reader's words. |
| 13286 | tidyPanels | The panels as a tidy sees them: a rectangle of paper, the conversations |
| 13357 | tidyHomeOf | Which panel a card belongs beside, if any. |
| 13382 | tidyColumnX | The first x at or right of `x` that no panel already stands in. |
| 13400 | tidyBySession | The order cards stand in beside their panel: the panel's own order. |
| 13406 | tidyByTray | The order the inbox tray keeps: what is finished sinks to the bottom. |
| 13426 | tidyGroup | Lay one group of cards out as a column beside its panel. |
| 13489 | tidyPlan | Where every idea card belongs, as a list of places and a list of put-aways. |
| 13532 | tidyBoard | Tidy the canvas: put every idea card where it belongs, and leave the |
| 13584 | glideTidyBatch | Fly one tidy's cards to their places, a beat apart. |
| 13642 | openBoard | Mount the board. |
| 13691 | mountBoardInto | Build the board's parts into a root element, whichever mount owns it. |
| 13951 | unmountBoard | Unmount the board, whichever mount holds it. |
| 14052 | closeBoard | Take the floating board down, element and all. |
| 14079 | boardFieldOpen | Repaint the whole canvas from the feeds. |
| 14105 | renderBoard | } |
| 14317 | boardStatusFingerprint | The board's reading of every card's status, as one string. |
| 14338 | renderBoardOnStatus | Repaint the board for a status tick, but only if something on screen |
| 14353 | tickBoardClocks | Move the running cards' minute hands, in place. |
| 14376 | startDayTimer | Arm the one timer that watches for midnight. |
| 14391 | stopDayTimer | Stop the midnight timer: the board closed, or the page went away. |
| 14398 | startBoardClock | Start the tick that keeps the board's clocks honest. |
| 14409 | stopBoardClock | Stop the tick: the board closed, or nothing on it is running. |
| 14423 | requestBoardTurns | Ask for the turn counts the board is missing. |
| 14453 | paintHistory | Paint the "only what is marked" toggle to match the state it stands for. |
| 14468 | paintBoardStarFilter | } |
| 14485 | slotHue | One workspace on the canvas: a heading that can be dragged, and the |
| 14498 | slotSeed | Which seat a block starts on: its own id, never its name. |
| 14515 | boardSlots | Give every panel on this paint its own slice of the wheel. |
| 14550 | blockSeat | The seat one block wears: the one written down, else the one this paint gave it. |
| 14571 | goalHue | The hue one place is washed with, or null for the tray. |
| 14577 | blockInk | The colour one panel's own mark wears. |
| 14594 | noteHue | The paper one note is written on. |
| 14598 | notePaper | } |
| 14625 | noteInkOf | The ink one note is drawn in. |
| 14725 | boardIcon | One of those glyphs, at a size, as an element. |
| 14782 | boardNoteCols | How many rows an idea card's field needs for what it holds. |
| 14788 | boardTextRows | } |
| 14813 | boardEditorRows | The lines a card's field opens on. |
| 14841 | boardNoteMetrics | How much paper one idea card takes. |
| 14875 | noteParts | How much paper one idea card takes: its heading, and the lines it holds. |
| 14895 | boardCardBox | How much paper one idea card takes at rest. |
| 14921 | boardCardOpenBox | The paper a note takes while its field is up: all of its body, up to the cap. |
| 14943 | canvasPointOf | Where a point on the screen falls on the paper. |
| 14965 | raiseBoardCard | Bring one card to the front of the paper. |
| 14985 | beginNoteLift | Lift one put-away note out of the tray, under the hand. |
| 15035 | markDropGoal | Say which goal would take the card if the hand let go of it here. |
| 15050 | boardHomeOf | The goal one conversation is drawn in on this paint, or null. |
| 15072 | markNoDrop | Say, under the hand, that the paper will not take this card. |
| 15098 | dropNoDropTip | Take the "the paper will not take it" line off the page. |
| 15117 | goalNodeAt | The goal panel under a native drag, asked in the order a browser answers. |
| 15129 | nearestGoal | The goal panel an element stands in, or null when it stands in none. |
| 15145 | goalUnder | The goal the pointer is standing in, as the id a card is filed under. |
| 15161 | goalHeadKeyUnder | The goal whose heading an element stands in, as the key a card starts a |
| 15186 | boardDragHasText | Whether a native drag carries words, the one thing the shell's rows set. |
| 15224 | sessionInPayload | The words a native drag is carrying, read where the browser allows it. |
| 15251 | boardDragText | } |
| 15269 | clearBoardDragGoal | Take the goal highlight a native drag drew off the paper. |
| 15286 | onNativeDragEnd | A native drag is over, however it ended. |
| 15300 | onBoardDragOver | Say, while a native drag is over the canvas, which goal would take it. |
| 15316 | onBoardDragLeave | The native drag left the canvas: take the goal highlight with it. |
| 15336 | onBoardDrop | A conversation let go on the canvas, carried in from the host's sidebar. |
| 15363 | dropSessionOntoBoard | Take one conversation the reader dragged in, and keep it. |
| 15388 | buildSeatMenu | The twelve colours a goal can wear. |
| 15421 | pickSeat | One colour, as a press. |
| 15436 | buildBoardBlock | } |
| 15774 | trayCaption | The conversations of one block, cut into threads. |
| 15789 | trayQuiet | A quiet line where a section has nothing in it yet. |
| 15807 | buildTrayNote | One note, as a line of the tray. |
| 15955 | trayInk | Ink every conversation inside one node with the tray's paper. |
| 15967 | doneBinCards | Every note put away in the finished-cards bin, newest first. |
| 15972 | doneBinCardsOf | The put-away notes one conversation was handed, newest first. |
| 15991 | openDoneBinFor | Open the bin on one conversation's own put-aways. |
| 16006 | paintDoneBin | Say how many cards the bin holds, and what it is doing. |
| 16021 | toggleDoneBin | Open or close the finished-cards list. |
| 16039 | buildDoneRow | One finished note, as a line of the card's list. |
| 16126 | mountDoneBin | Put the finished-cards list on the board, or take it away. |
| 16214 | ejectFromDoneBin | Put one card back on the paper, out of the finished-cards bin. |
| 16233 | buildInboxBody | The tray's body: the conversations nothing accounts for, and the notes put away here. |
| 16278 | boardBlockColumns | How many columns a panel reads across. |
| 16294 | boardCardStacked | Whether one card is drawn inside a conversation's column. |
| 16317 | boardBlockWidth | How wide a panel stands. |
| 16341 | buildBoardColumns | A goal's conversations, laid out across the panel. |
| 16394 | buildQuietStrip | The conversations a panel carried in and nobody has touched, one line each. |
| 16450 | buildQuietRow | One quiet conversation, as the line it is drawn as. |
| 16522 | buildQuietStack | The thoughts under one quiet conversation, once its count was pressed. |
| 16541 | buildBoardStack | The thoughts filed under one conversation. |
| 16607 | markCardFresh | Wear the one beat a completion is worth - once. |
| 16640 | buildBoardCard | One conversation on the board: its name, what it is doing, and the |
| 17090 | beginBlockRename | Start typing a goal's name into its heading. |
| 17096 | commitBlockRename | Keep the name the heading says, and close the field. |
| 17108 | cancelBlockRename | Throw the typed name away, leaving the goal as it was called. |
| 17125 | goalBaseName | The last piece of a workspace path: what the workspace is called. |
| 17138 | beginGoalIntent | Start writing what a goal is for. |
| 17153 | commitGoalIntent | Keep what the open line says, and close it. |
| 17165 | cancelGoalIntent | Throw the typed line away, leaving the goal as it was. |
| 17184 | removeBoardGoal | Take one goal off the canvas, with a few seconds to bring it back. |
| 17231 | boardNameCollisions | Which drawn cards share a name, and where each one stands in its group. |
| 17257 | boardTitleOf | The name one card wears: the reader's word while the shell catches up, |
| 17273 | noteCardTitle | Put the reader's word on a card before the shell has answered. |
| 17288 | settleTitles | Let go of the stand-in names the feed has caught up with, or outlived. |
| 17307 | beginBoardRename | Start renaming one conversation from its card. |
| 17325 | commitBoardRename | Keep what the open name field says, and rename the conversation. |
| 17364 | cancelBoardRename | Throw the open name field away, leaving the conversation as it was. |
| 17383 | forkBoardCard | Start a branch from one conversation, and draw the line when it lands. |
| 17429 | returnForkMark | Let a conversation's branch mark answer again, and say so on the card. |
| 17445 | waitForBranchRow | The catalogue row for one conversation, asked for until it arrives. |
| 17477 | settleBranchName | Give a fresh branch a name nobody else is using, and answer with it. |
| 17520 | pasteIntoComposer | Put words in the message box of the conversation on screen. |
| 17554 | composerHasText | Whether the message box already holds something. |
| 17570 | boxHasText | Whether one box already holds words. |
| 17585 | seatCaretAtEnd | Put the caret at the end of the box's content. |
| 17624 | dropCardIntoComposer | Hand one loose card's words to a conversation's message box. |
| 17644 | pasteIntoBoxNow | Put the words in the box that is on screen right now, if there is one. |
| 17666 | putThroughEditor | Put text into the editor through the editing command. |
| 17685 | pasteThroughEvent | Put text into the editor as a real paste event. |
| 17724 | buildIdeaMenu | One loose card: a thought the reader put on the canvas rather than in a |
| 17760 | ideaMenuItem | One line of that menu. |
| 17789 | buildSessionMenu | The verbs on a conversation card that are not worth a seat of their own. |
| 17820 | placeCardMenu | One line of that menu. |
| 17837 | cardMenuItem | } |
| 17865 | buildBoardLooseCard | } |
| 18211 | boardJoinText | Join a card's two parts back into the one string the store keeps. |
| 18230 | beginBoardCard | Start typing into one loose card - at its title, or at its body. |
| 18270 | boardTakeCardText | Keep what the open field says, and close it. |
| 18287 | commitBoardCard | } |
| 18300 | cancelBoardCard | Throw the open field away, leaving the card as it was last written. |
| 18321 | settleBoardCardForPress | Settle the open card field for a press, without the paint a settle |
| 18338 | addBoardCardAt | Write a new card at a place, and start typing in it. |
| 18360 | addBoardCard | Write a new card where the reader is looking, or below everything when the |
| 18377 | removeLooseCard | Take one loose card off the canvas. |
| 18422 | removeBoardCard | Take one conversation off the board. |
| 18464 | handleOf | A press on a block's heading: the handle the panel is dragged by. |
| 18493 | beginStackedCarrier | Lift one card out of a conversation's column, where the hand is. |
| 18532 | stackCardBefore | The card a drop should sit above, from where the pointer let go. |
| 18560 | closeIdeaMenu | Mark the column the hand is over, or clear every mark. |
| 18577 | closeSeatMenu | Put the colour wheel away, without a repaint. |
| 18596 | closeSessionMenu | Put a conversation card's menu away, without a repaint. |
| 18612 | paintStackDrop | } |
| 18630 | paintHeadDrop | Light the heading of the goal a carried card would start a conversation in. |
| 18649 | parkCardOutside | Give a card lifted out of a column a place on the paper. |
| 18676 | boardPointerDown | The one press handler on the canvas. |
| 18823 | boardNoteDone | Put the drop bands on screen, or take them away. |
| 18831 | showDropZones | } |
| 18846 | boardListen | Start listening for the rest of a gesture, once it has been armed. |
| 18863 | beginSessionGrab | Start a session drag: a sort inside its own panel, a carry outside it. |
| 18881 | beginSessionReorder | Sort one conversation among its neighbours, where the hand is. |
| 18936 | paintSessionReorder | Follow the hand, and let the other columns make room as it passes them. |
| 18963 | leaveSessionReorder | Hand the drag back to the carrier, because the pointer left the panel. |
| 18976 | resetSessionReorder | Put every column back where the paint left it. |
| 18997 | commitSessionReorder | Write the order the hand chose, once, and draw it. |
| 19027 | beginSessionCarrier | Give a carried card its body, where the hand is. |
| 19069 | onBoardMove | Follow the pointer: pan the paper, or carry what the hand picked up. |
| 19181 | onBoardUp | Let go: write down what the gesture decided, unless it never moved. |
| 19404 | handCardToSession | Hand one loose card's words to a conversation, and leave a trace behind. |
| 19430 | nameSessionForCard | Let the conversation a card was handed to wear the card's own name. |
| 19460 | drawCardLinks | Draw the elbow from every branch back to the conversation it was cut from. |
| 19516 | cancelBoardDrag | Drop the gesture and put back what it was carrying. |
| 19526 | endBoardDrag | Take the gesture's furniture off the page and forget it. |
| 19568 | onBoardBlurDrag | The window losing focus mid-gesture: the pointer left with it. |
| 19583 | onBoardDoubleClick | A double click on the paper: write a card right there. |
| 19629 | makeNotice | The transient line the plugin speaks in. |
| 19852 | showToast | Say one thing for a moment. A second press replaces the line and restarts |
| 19857 | hideToast | Take the notice down and drop the pending timer. |
| 19871 | SendHintLine | The line that names the send key, contributed to the shell's own dock row |
| 19903 | sendKeyLabel | The modifier this machine's send accelerator lives on, named the way the |
| 19922 | modelDirectories | The host's session model-selection service, when it publishes one. |
| 19938 | effortLevels | The reasoning levels one model offers, in the order the composer's own |
| 19962 | levelIndex | Where one level sits in the list. An explicit selection wins; without one |
| 19983 | currentLevelId | The level in effect for one selection, read the way the composer's own |
| 19994 | isCurrentEntry | Whether one entry is the model the conversation is already on. |
| 20012 | rowMarkedLevel | The level one picker row shows as marked, which is the level it would end |
| 20032 | rowSubmitLevel | The level one picker row would submit if it were confirmed without the |
| 20045 | refusal | A refusal this plugin can explain on its own, so the notice carries |
| 20064 | cycleEffort | One press of the reasoning key: step the visible conversation's level one |
| 20098 | stepEffort | Read the levels off one session directory and submit the next one. |
| 20148 | catalogGroups | Every provider/model the host currently advertises, for the settings page. |
| 20186 | groupsOf | The provider groups out of one loaded catalog or directory snapshot. Both |
| 20204 | offeredModels | The catalog as a lookup, one entry per `provider/model`. |
| 20242 | modelEntries | The configured models the directory currently offers, in the order the |
| 20254 | modelIndex | Where one model sits in the list; -1 when it is not one of them. |
| 20271 | modelDirectoryOfCurrent | Resolve the model directory behind the conversation on screen. |
| 20302 | readModelList | Read the list off one session directory. |
| 20346 | readNewSessionModelList | The list the sheet's model row offers. |
| 20369 | openNewSessionModelPick | Open the model window for the sheet's model row. |
| 20409 | openModelPick | One press of the model key: open the picker on the list of models the |
| 20621 | modelPickHint | The line under the picker: what it is showing, and what the keys do. |
| 20650 | renderModelPick | Repaint the picker's rows and footer from `MODELPICK.entries`. |
| 20673 | markedLevel | The level one row is currently marked with. |
| 20688 | confirmLevel | The level one confirm would submit. |
| 20711 | buildModelRow | One row of the picker: the model's name with the `current` tag in front of |
| 20766 | buildLevelCell | The levels of one model. |
| 20819 | levelClickHandler | The press handler for one level chip. |
| 20833 | keepModelPickVisible | Keep the selected row in sight when the list is longer than the card. |
| 20855 | openModelWindow | Mount the picker, with the selection already on the model in effect. |
| 20921 | closeModelPick | Unmount the picker and forget everything it was showing. |
| 20957 | moveModelPick | Move the picker's selection, wrapping at both ends. |
| 20985 | moveModelPickEntry | Put the selected model somewhere else in the list, and remember it there. |
| 21025 | reorderFavorites | Put an ordered list of pairs back into the configured one, in the new |
| 21053 | stepModelPickLevel | Step the level of the selected row, wrapping at both ends. |
| 21082 | confirmModelPick | Confirm the selected row: submit its model at its marked level, then take |
| 21147 | modelToast | The one-line notice after a switch, naming the level when the row has one. |
| 21159 | levelName | The readable name of one level of one model, or null when there is none. |
| 21181 | modelPickKeyDown | Route one keystroke to the open picker. |
| 21259 | switchModel | Read the catalog off one session directory and submit the model and level |
| 21360 | makeTranslator | Translate through the locale seat when it is wired, else through the |
| 21376 | KeyRow | One rebindable key: focus the box, press the key you want. |
| 21416 | SliderRow | One numeric preference. |
| 21446 | ChoiceRow | A short set of mutually exclusive options, as a row of toggles. Used for |
| 21492 | ModelListGroup | The switchable models as one settings group: what is chosen, in the order |
| 21685 | VimSection | The whole Settings → Vim scrolling page. |
| 21925 | BoardPage | The board as the main panel's page. |
| 21960 | BoardPanelIcon | The sidebar entry's glyph: three columns, which is what the board is. |
| 22005 | installBoardPage | Contribute the board as a sidebar entry and a main panel. |
| 22064 | installWindowCSS | The rules every window this plugin mounts shares, once. |
| 22108 | installBoardCSS | Put the board's hover and motion rules on the page, once. |
| 22273 | installSettings | Contribute the settings page and its vocabulary. Both contributions are |
| 22349 | makeApi | Debug and tuning surface, also used by tools/selftest.mjs. |
| 22683 | apply | Client activation. |
