# MAP - lib/client.js

由 `npm run map` 生成，不要手改。找一个功能的入口：先在这里按名字查到行号，再读那一段。

lib/client.js：23119 行，460 个顶层函数。

| 行 | 函数 | 上方注释 |
|---:|---|---|
| 1286 | localeIsZh | Best-effort locale guess, used for the nav label and fallback strings. |
| 1310 | defaults | Shipped defaults as a fresh object, derived from DEFAULTS so a new |
| 1320 | copy | Current preferences as a fresh object. |
| 1344 | isBindableKey | A single printable character, or one of `NAMED_KEYS`, is the only thing |
| 1360 | normalizeKey | Normalise a bound key to its stored form: lower case for characters, |
| 1376 | keyLabel | How a bound key reads in the settings box. A space is invisible in a box |
| 1383 | clampNumber | Clamp a numeric preference to its accepted range. |
| 1399 | sanitizeFavorites | The switchable models as a fresh list of `{provider, model}` pairs. |
| 1418 | persist | Persist the current preferences; storage failures are not fatal. |
| 1427 | announce | Notify the settings page that preferences changed. |
| 1442 | applyPatch | Validate and apply one patch. Rejected patches leave preferences intact. |
| 1516 | firstFree | The preferred key when it is free, else the first free letter. |
| 1536 | repairKeys | Force each key group to be conflict-free. Groups are repaired back to |
| 1600 | migrateArchiveSeat | Move the archive seat into place for a store written before it existed. |
| 1616 | load | Read stored preferences over the defaults. |
| 1669 | setStage | Mark one conversation, or take the mark off it, and repaint. |
| 1686 | stageHandler | The press handler for one stage word on one row. |
| 1703 | cyclePhase | Advance one conversation to the next stage, and repaint the window. |
| 1714 | subscribe | Subscribe to preference changes. |
| 1751 | isEditable | True when the element consumes printable characters itself. |
| 1765 | isScrollable | True when the element is a non-editable box that overflows vertically and |
| 1778 | parentOf | Parent element, crossing shadow boundaries through the host node. |
| 1789 | scrollerFrom | Nearest scrollable ancestor, inclusive. |
| 1799 | largestScroller | Largest visible scroll container; the last-resort target. |
| 1822 | elementAt | The topmost element at a point, when the document can be asked. A host |
| 1843 | pickScroller | Choose the container to scroll. Deterministic order: whatever sits under |
| 1867 | canMove | Whether the container still has room in the requested direction. |
| 1879 | resolveTarget | Walk from the picked container up to the first one that can move. This is |
| 1889 | reducedMotion | Honour the OS "reduce motion" preference. |
| 1899 | suppressSmooth | Pin `scroll-behavior: auto` for the animated element. Without this, a |
| 1908 | stopAnim | Stop the animation loop and restore anything it changed. |
| 1925 | frame | One animation frame: ease `current` toward `target`, frame-rate |
| 1951 | push | Queue a scroll step. Resolves (or reuses) the container, extends the |
| 1978 | stopHold | Cancel the held-key auto-repeat. |
| 1990 | tickHold | Auto-repeat tick: one more step, then schedule the next sooner. |
| 2011 | startHold | Start a hold: one immediate step, then our own accelerating repeat. The |
| 2028 | directionOf | Which direction a pressed key drives, if any. |
| 2043 | onKeyDown | Capture-phase key handler. Runs before the app's own handlers so the |
| 2417 | onKeyUp | Any keyup ends the hold, so a dropped keyup cannot leave the view scrolling. |
| 2443 | onEscapeBlur | Escape leaves a focused composer, so the scroll keys come back. |
| 2468 | onPointerMove | Remember where the pointer is. |
| 2489 | forgetPointer | Forget the remembered pointer, so the focus and centre rules decide again. |
| 2494 | onUserScroll | The user took over with the wheel or a touch: abandon our animation. |
| 2510 | onFocusLoss | Losing the window or the tab must not leave a hold or a stale pointer |
| 2955 | makeTurnPeek | The ledger behind `TURNS`, and the only thing that touches it. |
| 3079 | makePhaseLedger | The ledger behind `PHASES_MODEL`, and the only thing that touches the |
| 3194 | makeRunLedger | The ledger behind `RUNS`, and the only thing that touches it. |
| 5629 | applyBoardPageInk | Paint the page with the host's theme. |
| 5681 | sizePanel | Fit the panel to the configured size. |
| 5694 | placementMargin | How far the panel is held off the edge it is parked against. |
| 5706 | placePanel | Park the panel according to the configured position. The one place that |
| 5734 | serviceOf | One host service, however this context publishes it. These two are read |
| 5753 | taskServices | The session feed, the workspace registry, and the workspace navigator. |
| 5782 | statusFor | The shell's unified status entry for one conversation, if it publishes one. |
| 5799 | currentSession | The conversation on screen, as the shell's own shortcuts see it: the one |
| 5819 | currentSessionRunning | True when the conversation on screen has a turn in flight. |
| 5837 | statusOf | What one conversation is doing right now, as a short label. |
| 5857 | turnsOf | The turn count already peeked for a conversation, or null. |
| 5867 | statusIsLive | True for the statuses that mean a turn is in flight: one that is running, |
| 5895 | noteDeliveries | Note the turn ends: a conversation this page watched run, no longer running. |
| 5921 | syncRuns | } |
| 5938 | watchRuns | Follow the status source for the life of the page, so a turn is stamped |
| 5961 | loadRunStamps | Read the stamps the previous page left behind, dropping the ones that are |
| 5969 | forgetRuns | Stop watching, and forget every stamp the watch had taken. |
| 5978 | runSince | The moment the turn in flight in one conversation was seen to start. |
| 5994 | elapsedText | How long a turn has been in flight, at minute resolution. |
| 6012 | tickClocks | Repaint the live chips, in place. |
| 6042 | clockDelay | Milliseconds until the next whole minute of the oldest clock given. |
| 6053 | startClock | Start the tick that keeps the clocks on screen honest. |
| 6064 | stopClock | Stop the tick: the window closed, or nothing on screen is running. |
| 6102 | donePulseAmount | How far into the beat `progress` (0..1) is, as a 0..1 swell. |
| 6116 | paintDonePulse | Paint the beat on every "just finished" chip on screen. |
| 6132 | tickDonePulse | One frame of the beat; schedules the next, or puts the chips back. |
| 6156 | startDonePulse | Start the beat, unless there is nothing to point at or the OS asked for |
| 6164 | stopDonePulse | Cancel the beat and put every chip it touched back. |
| 6182 | requestTurns | Queue a turn count for every loaded row that does not have one yet. |
| 6195 | drainPeeks | Start as many queued peeks as the concurrency budget allows. |
| 6214 | peekTurns | Read one session's `sessionStats.turns` and let go of it again. |
| 6283 | cancelPeeks | Drop every queued and in-flight peek; the window closed or unloaded. |
| 6288 | paletteText | Built-in string for the task window; it is plugin chrome, not shell copy. |
| 6299 | relativeTime | Coarse "how long ago" for a row. Deliberately four buckets, so a list |
| 6310 | paletteHint | Footer hint, rebuilt from the live bindings and the current depth. |
| 6369 | paletteHeadline | The one line above the list: what is on the reader's plate right now. |
| 6399 | conversationPool | Every conversation worth offering, newest first. |
| 6446 | sortByRecency | Sort rows by recency, newest first, with the id as a deterministic |
| 6465 | hereIndex | Where the conversation on screen sits in a list, or 0 when it is not |
| 6491 | firstOwedIndex | Where the selection opens: the first thing waiting on the reader, else |
| 6524 | attentionOf | Which attention block a conversation belongs to, or null for the plain |
| 6568 | paletteBlocks | Split the pool into the attention blocks and the browsing blocks. |
| 6644 | waitedSince | How long a conversation has been waiting on the reader, as a stamp. |
| 6663 | revealMore | Reveal one more batch of older conversations. |
| 6708 | paletteSections | The blocks to draw, in order, each with its header. |
| 6747 | rebuildRows | Rebuild `rows` and `sections` from the two blocks. |
| 6773 | folderIndex | Which folder each conversation lives in, as `{ label, path }` keyed by |
| 6810 | folderById | One workspace, by the id the board files its goals under. |
| 6842 | workspaceForGoal | The workspace a new conversation started from one goal would join. |
| 6871 | boardBlockByKey | One goal of the last paint, by the key a card is filed under. |
| 6885 | folderLabel | What a folder reads as on a row: the Workspace's own title, else the last |
| 6917 | rowColumns | The row grid: the state chip, the name, and the metadata — tag, stage, |
| 6937 | columnOf | The grid column one cell belongs to, on this repaint. |
| 6950 | widestCell | The widest content width among one column's cells. |
| 6976 | fitColumns | Give every row the same tracks, sized to what is actually on screen. |
| 7008 | namesOwnFolder | Whether a row in this block has to name its own folder. |
| 7020 | buildRow | One list row. Clicking it switches, so the window is not keyboard-only. |
| 7204 | buildRenameInput | The name box that replaces a row's title while it is being renamed. |
| 7239 | focusRename | Put the caret in the name box, with the whole name selected the first time |
| 7263 | beginRename | Start renaming the selected conversation. |
| 7272 | cancelRename | Drop the edit and repaint the row as it was. |
| 7286 | commitRename | Hand the typed name to the host. |
| 7323 | renameSession | Rename one conversation, the way the shell's own sidebar does it: retain |
| 7373 | archiveSession | Archive the selected conversation, through the host's own action. |
| 7413 | archiveFailureText | A reason from whatever the host rejected an archive with. |
| 7434 | archiveSelected | Archive the selected row, with the footer saying what happened. |
| 7455 | failureText | A short reason from whatever the host rejected with: a remote failure |
| 7467 | setPaletteNotice | Say something in the footer. The next repaint restores the hint, so a |
| 7482 | resetPaintScratch | Put this repaint's measurements away, ready for the next one. |
| 7498 | renderPalette | Repaint the list from `PALETTE.sections`; cheap enough at this size. |
| 7569 | moreReachable | Whether the "More" seat has anything left to give. |
| 7586 | buildSectionHeader | One block heading. It is not selectable and not a row: it names the block |
| 7630 | scrollSelectionIntoView | Keep the cursor visible when the list is longer than the panel. |
| 7644 | moreHeadingNode | The "More" heading element currently on screen, or null. |
| 7670 | refreshPalette | Re-read both feeds, holding the selection on the same conversation and |
| 7716 | selectedRow | The conversation under the cursor, or null when the cursor is standing on |
| 7732 | moreSeatAt | Where the "More" seat stands in the row order, as a row index. |
| 7755 | moveSelection | Move the selection, wrapping at both ends. |
| 7799 | activateSelection | Act on whatever the selection is standing on. |
| 7811 | openPalette | Mount the window and read the feed. Rolling state is torn down first: |
| 7923 | closePalette | Unmount the window and drop every feed subscription. |
| 7983 | paletteKeyDown | Route one keystroke to the open window. |
| 8107 | composerRoot | The message box: the rich-text editor root the shell puts the caret into. |
| 8124 | rememberComposer | Remember the element a focus landed on. It is the fallback for a host |
| 8141 | isComposerEditor | True when an element is a rich-text editor, i.e. the message box — and |
| 8157 | noteFocusRequest | Mark that the user just asked for the keyboard themselves, so the focus |
| 8176 | clearFocusRequest | Drop a request the user has just superseded by doing something else. |
| 8191 | isActivating | True for a control a bare Space activates by itself. Such a control keeps |
| 8204 | focusComposer | Put the keyboard in the message box: what the focus key is for. |
| 8229 | composerIsEmpty | True when the message box holds nothing the user put there. |
| 8252 | leaveEmptyComposer | The focus key pressed again, inside the box it put the caret in: hand the |
| 8280 | inComposer | True when a keystroke was aimed at the message box. |
| 8303 | menuOpen | True while a suggestion menu is waiting to be confirmed. |
| 8332 | onSendKey | True when this keystroke is a send, and the keyboard should not stay in |
| 8361 | doubleEnterSends | True when this Enter is the second half of a double-Enter send. |
| 8391 | sendFromComposer | Send the draft by handing the host the key it already sends with. |
| 8442 | handBackAfterSend | Give the keyboard back to the page after a send, without waiting for a |
| 8473 | breakLine | Turn a bare Enter into the host's own line break. |
| 8527 | onFocusIn | Keep the message box from taking the keyboard on its own. |
| 8553 | noteFocusReturn | Widen the licence to a focus arriving right after the window got the |
| 8565 | justReturned | Whether a focus arriving now is the tail of the window coming back. |
| 8577 | onPointerDown | A press says where the keyboard should be: inside a text field it asks |
| 8602 | dismissOutsidePress | Put an open window away when the press landed beside it. |
| 8628 | pressMissesWindow | Whether a press landed outside an open window's card. |
| 8640 | activateSession | Switch the main view to one conversation. |
| 8696 | reportStoreFull | Say that the board could not be written, once. |
| 8703 | makeBoardStore | } |
| 10151 | makeHistory | The board's history: what was done, and how to put it back. |
| 10275 | makeNoteStore | The lines pinned to conversations, and the only thing that touches them. |
| 10416 | makeHistoryStore | The history's own store: one record per local day, in IndexedDB. |
| 10597 | makeJournal | The sessions a day inherited, kept where a repaint can reach them. |
| 10772 | makeCarryStore | } |
| 10867 | dayOf | The local day a moment belongs to, as `YYYY-MM-DD`. |
| 10876 | daysBetween | How many local days lie between two `YYYY-MM-DD` days. |
| 10886 | readMoment | The page the board last drew, as it was left, or null. |
| 10900 | forgetMoment | Forget the page that was left, once it has been filed. |
| 10924 | noteMoment | Remember the page this repaint draws. |
| 10948 | momentHeld | Whether the store still holds exactly the bytes this page last wrote. |
| 10967 | pageDoc | The arrangement a day's page keeps. |
| 10993 | pageView | The page as it reads, frozen. |
| 11043 | settleDay | File the page that was left, and start today. |
| 11078 | filePage | Write one page, and keep the history's size honest. |
| 11111 | settleCarry | Carry the members of the page just filed into today. |
| 11128 | pruneHistory | Keep the newest `snapshotKeepDays` pages, and no more. |
| 11146 | dropCarried | Let go of the conversations carried longest with no movement. |
| 11174 | maybeShowSeal | Show the day that just ended, once, the first time the board is up after it. |
| 11196 | sealCounts | The counts one day's summary reads off. |
| 11217 | sealLeft | What the desk still owes the reader, as of this press. |
| 11246 | paintSeal | Draw one day's summary. |
| 11322 | closeSeal | Take the day's summary down. |
| 11333 | historySearchRow | The one-line search above the days. |
| 11366 | searchHistory | Find a sentence across the pages, newest first. |
| 11408 | historyMatches | The lines of one page that carry the needle: its cards, its notes, its names. |
| 11436 | historyHitRow | One page a search found, with the lines it was found by. |
| 11474 | openBoardHistory | Open the history: the pages the board has been. |
| 11547 | closeBoardHistory | Take the history panel down, whichever page it was showing. |
| 11569 | renderHistory | Draw the list of days. |
| 11596 | historyNote | One quiet sentence where a page would be. |
| 11604 | historyMeta | How a page reads at a glance: what it was made of. |
| 11615 | historyDayRow | One day in the list, and its page once it is opened. |
| 11643 | historyDetail | One day's page, as it read: its goals, their conversations, its cards. |
| 11769 | restoreDay | Copy one page into today. |
| 11794 | applyPageOrder | Put the page's own arrangement back onto the panels. |
| 11812 | settleRestoredCarry | Seat a restored page's members as today's carried set. |
| 11826 | keepBackup | Keep what a restore or an import is about to replace. |
| 11839 | takeBeforeBackup | Take back what the last restore or import replaced. |
| 11857 | downloadJson | Hand a file to the browser. |
| 11891 | exportHistory | Write the board, its notes and every page into one file. |
| 11922 | pickHistoryFile | Ask for one file, and take it in when it arrives. |
| 11957 | importHistory | Take in one exported file. |
| 12002 | toggleBoard | The board the plugin opens when a page is not available. |
| 12015 | showBoard | } |
| 12041 | pointInSelection | Whether one right press landed inside the words the reader selected. |
| 12082 | onContextMenu | The way back from a conversation: a right press on its page. |
| 12102 | beginBoardNote | Start typing the line on one card. |
| 12115 | commitBoardNote | Keep what the open field says, and close it. |
| 12130 | cancelBoardNote | Throw the open field away, leaving the card as it was. |
| 12146 | openNote | The note key: open the board on the conversation on screen, with its |
| 12183 | pinToBoard | Put one conversation on the board by hand. |
| 12209 | startOfToday | Midnight today, in the reader's own zone. |
| 12243 | goalByKey | The canvas as it is drawn: one block per workspace in play, the |
| 12269 | nextGoalName | The name a goal cut from a card starts with: the one it came from, plus |
| 12297 | warmCard | Whether a conversation is still warm, and so stands above the rule. |
| 12308 | boardBlocks | } |
| 12485 | rememberFork | Record a fork this plugin watched, and repaint a board that is up. |
| 12509 | inheritForkHome | File a branch in the goal its parent is in. |
| 12532 | revealBoardCard | Bring one card into view, without moving the paper any further than it |
| 12555 | watchForks | Watch the sessions service for forks, so a branch made anywhere in the |
| 12595 | boardPlaces | The places the blocks will be drawn at. |
| 12625 | firstFreeSlot | The first place on the paper no block already stands on. |
| 12657 | slotTaken | Whether a block already stands on a place. |
| 12683 | boardPanelHeights | How tall each painted panel stands, keyed by the block it is. |
| 12704 | boardPanelWidths | How wide each painted panel stands, keyed by the block it is. |
| 12730 | boardExtent | How big the stage has to be to hold everything on it. |
| 12758 | applyBoardZoom | Put the canvas's magnification on the paper. |
| 12781 | setBoardZoom | Zoom the canvas, keeping one point of it where it is on screen. |
| 12803 | onBoardWheel | Ctrl/Cmd + wheel zooms the canvas, the way every canvas does. |
| 12823 | nextCardPlace | Where a new loose card goes when the reader did not point at a place. |
| 12854 | boardFreePlace | A place on the paper for a goal that was just asked for, near the eye. |
| 12897 | addBoardGoal | Stand a new goal on the canvas, ready to be given a purpose. |
| 12919 | closeNewSessionSheet | Take the new-conversation sheet down, and forget what it was writing. |
| 12944 | paintNewSessionBusy | Put the sheet's confirm button in step with the one host round trip. |
| 12960 | paintNewSessionModel | Say which model the sheet would start the conversation on. |
| 12984 | paintNewSessionField | Paint one of the sheet's fields as focused or not. |
| 12995 | watchNewSessionField | Let a field say where the caret is, for as long as it lives. |
| 13010 | openNewSessionSheet | Show the sheet that asks for a conversation's name and the words it opens with. |
| 13219 | commitNewSessionSheet | Read the sheet and start the conversation it describes. |
| 13253 | applyNewSessionModel | Put the model the sheet was set to onto the conversation just made. |
| 13295 | startNewSessionForGoal | Start one conversation under one goal, with the reader's words. |
| 13397 | tidyPanels | The panels as a tidy sees them: a rectangle of paper, the conversations |
| 13468 | tidyHomeOf | Which panel a card belongs beside, if any. |
| 13493 | tidyColumnX | The first x at or right of `x` that no panel already stands in. |
| 13511 | tidyBySession | The order cards stand in beside their panel: the panel's own order. |
| 13517 | tidyByTray | The order the inbox tray keeps: what is finished sinks to the bottom. |
| 13537 | tidyGroup | Lay one group of cards out as a column beside its panel. |
| 13600 | tidyPlan | Where every idea card belongs, as a list of places and a list of put-aways. |
| 13643 | tidyBoard | Tidy the canvas: put every idea card where it belongs, and leave the |
| 13695 | glideTidyBatch | Fly one tidy's cards to their places, a beat apart. |
| 13753 | openBoard | Mount the board. |
| 13802 | mountBoardInto | Build the board's parts into a root element, whichever mount owns it. |
| 14062 | unmountBoard | Unmount the board, whichever mount holds it. |
| 14166 | closeBoard | Take the floating board down, element and all. |
| 14193 | boardFieldOpen | Repaint the whole canvas from the feeds. |
| 14219 | renderBoard | } |
| 14435 | boardStatusFingerprint | The board's reading of every card's status, as one string. |
| 14456 | renderBoardOnStatus | Repaint the board for a status tick, but only if something on screen |
| 14471 | tickBoardClocks | Move the running cards' minute hands, in place. |
| 14494 | startDayTimer | Arm the one timer that watches for midnight. |
| 14509 | stopDayTimer | Stop the midnight timer: the board closed, or the page went away. |
| 14516 | startBoardClock | Start the tick that keeps the board's clocks honest. |
| 14527 | stopBoardClock | Stop the tick: the board closed, or nothing on it is running. |
| 14541 | requestBoardTurns | Ask for the turn counts the board is missing. |
| 14571 | paintHistory | Paint the "only what is marked" toggle to match the state it stands for. |
| 14586 | paintBoardStarFilter | } |
| 14603 | slotHue | One workspace on the canvas: a heading that can be dragged, and the |
| 14616 | slotSeed | Which seat a block starts on: its own id, never its name. |
| 14633 | boardSlots | Give every panel on this paint its own slice of the wheel. |
| 14668 | blockSeat | The seat one block wears: the one written down, else the one this paint gave it. |
| 14688 | goalHue | The hue one place is washed with, or null for the tray. |
| 14694 | blockInk | The colour one panel's own mark wears. |
| 14711 | noteHue | The paper one note is written on. |
| 14715 | notePaper | } |
| 14742 | noteInkOf | The ink one note is drawn in. |
| 14842 | boardIcon | One of those glyphs, at a size, as an element. |
| 14899 | boardNoteCols | How many rows an idea card's field needs for what it holds. |
| 14905 | boardTextRows | } |
| 14930 | boardEditorRows | The lines a card's field opens on. |
| 14958 | boardNoteMetrics | How much paper one idea card takes. |
| 14992 | noteParts | How much paper one idea card takes: its heading, and the lines it holds. |
| 15012 | boardCardBox | How much paper one idea card takes at rest. |
| 15038 | boardCardOpenBox | The paper a note takes while its field is up: all of its body, up to the cap. |
| 15060 | canvasPointOf | Where a point on the screen falls on the paper. |
| 15082 | raiseBoardCard | Bring one card to the front of the paper. |
| 15102 | beginNoteLift | Lift one put-away note out of the tray, under the hand. |
| 15152 | markDropGoal | Say which goal would take the card if the hand let go of it here. |
| 15167 | boardHomeOf | The goal one conversation is drawn in on this paint, or null. |
| 15189 | markNoDrop | Say, under the hand, that the paper will not take this card. |
| 15215 | dropNoDropTip | Take the "the paper will not take it" line off the page. |
| 15234 | goalNodeAt | The goal panel under a native drag, asked in the order a browser answers. |
| 15246 | nearestGoal | The goal panel an element stands in, or null when it stands in none. |
| 15262 | goalUnder | The goal the pointer is standing in, as the id a card is filed under. |
| 15278 | goalHeadKeyUnder | The goal whose heading an element stands in, as the key a card starts a |
| 15303 | boardDragHasText | Whether a native drag carries words, the one thing the shell's rows set. |
| 15341 | sessionInPayload | The words a native drag is carrying, read where the browser allows it. |
| 15368 | boardDragText | } |
| 15386 | clearBoardDragGoal | Take the goal highlight a native drag drew off the paper. |
| 15403 | onNativeDragEnd | A native drag is over, however it ended. |
| 15417 | onBoardDragOver | Say, while a native drag is over the canvas, which goal would take it. |
| 15433 | onBoardDragLeave | The native drag left the canvas: take the goal highlight with it. |
| 15453 | onBoardDrop | A conversation let go on the canvas, carried in from the host's sidebar. |
| 15480 | dropSessionOntoBoard | Take one conversation the reader dragged in, and keep it. |
| 15505 | buildSeatMenu | The twelve colours a goal can wear. |
| 15538 | pickSeat | One colour, as a press. |
| 15563 | buildGoalMenu | The verbs on a goal that are not worth a seat of their own. |
| 15586 | goalMenuItem | One line of that menu. |
| 15617 | placeGoalMenu | Stand a goal's menu under its ⋯, inside the panel's right edge. |
| 15622 | buildBoardBlock | } |
| 16026 | trayCaption | The conversations of one block, cut into threads. |
| 16041 | trayQuiet | A quiet line where a section has nothing in it yet. |
| 16059 | buildTrayNote | One note, as a line of the tray. |
| 16207 | trayInk | Ink every conversation inside one node with the tray's paper. |
| 16219 | doneBinCards | Every note put away in the finished-cards bin, newest first. |
| 16224 | doneBinCardsOf | The put-away notes one conversation was handed, newest first. |
| 16243 | openDoneBinFor | Open the bin on one conversation's own put-aways. |
| 16258 | paintDoneBin | Say how many cards the bin holds, and what it is doing. |
| 16273 | toggleDoneBin | Open or close the finished-cards list. |
| 16291 | buildDoneRow | One finished note, as a line of the card's list. |
| 16378 | mountDoneBin | Put the finished-cards list on the board, or take it away. |
| 16466 | ejectFromDoneBin | Put one card back on the paper, out of the finished-cards bin. |
| 16485 | buildInboxBody | The tray's body: the conversations nothing accounts for, and the notes put away here. |
| 16530 | boardBlockColumns | How many columns a panel reads across. |
| 16546 | boardCardStacked | Whether one card is drawn inside a conversation's column. |
| 16569 | boardBlockWidth | How wide a panel stands. |
| 16593 | buildBoardColumns | A goal's conversations, laid out across the panel. |
| 16650 | buildBoardColumn | One conversation of a panel, as the column it stands in. |
| 16676 | buildPanelRule | The line between the cards still warm and the rest of what today touched. |
| 16717 | buildQuietStrip | The conversations a panel carried in and nobody has touched, one line each. |
| 16773 | buildQuietRow | One quiet conversation, as the line it is drawn as. |
| 16845 | buildQuietStack | The thoughts under one quiet conversation, once its count was pressed. |
| 16864 | buildBoardStack | The thoughts filed under one conversation. |
| 16930 | markCardFresh | Wear the one beat a completion is worth - once. |
| 16963 | buildBoardCard | One conversation on the board: its name, what it is doing, and the |
| 17414 | beginBlockRename | Start typing a goal's name into its heading. |
| 17420 | commitBlockRename | Keep the name the heading says, and close the field. |
| 17432 | cancelBlockRename | Throw the typed name away, leaving the goal as it was called. |
| 17449 | goalBaseName | The last piece of a workspace path: what the workspace is called. |
| 17462 | beginGoalIntent | Start writing what a goal is for. |
| 17477 | commitGoalIntent | Keep what the open line says, and close it. |
| 17489 | cancelGoalIntent | Throw the typed line away, leaving the goal as it was. |
| 17508 | removeBoardGoal | Take one goal off the canvas, with a few seconds to bring it back. |
| 17555 | boardNameCollisions | Which drawn cards share a name, and where each one stands in its group. |
| 17581 | boardTitleOf | The name one card wears: the reader's word while the shell catches up, |
| 17597 | noteCardTitle | Put the reader's word on a card before the shell has answered. |
| 17612 | settleTitles | Let go of the stand-in names the feed has caught up with, or outlived. |
| 17631 | beginBoardRename | Start renaming one conversation from its card. |
| 17649 | commitBoardRename | Keep what the open name field says, and rename the conversation. |
| 17688 | cancelBoardRename | Throw the open name field away, leaving the conversation as it was. |
| 17707 | forkBoardCard | Start a branch from one conversation, and draw the line when it lands. |
| 17753 | returnForkMark | Let a conversation's branch mark answer again, and say so on the card. |
| 17769 | waitForBranchRow | The catalogue row for one conversation, asked for until it arrives. |
| 17801 | settleBranchName | Give a fresh branch a name nobody else is using, and answer with it. |
| 17844 | pasteIntoComposer | Put words in the message box of the conversation on screen. |
| 17878 | composerHasText | Whether the message box already holds something. |
| 17894 | boxHasText | Whether one box already holds words. |
| 17909 | seatCaretAtEnd | Put the caret at the end of the box's content. |
| 17948 | dropCardIntoComposer | Hand one loose card's words to a conversation's message box. |
| 17968 | pasteIntoBoxNow | Put the words in the box that is on screen right now, if there is one. |
| 17990 | putThroughEditor | Put text into the editor through the editing command. |
| 18009 | pasteThroughEvent | Put text into the editor as a real paste event. |
| 18048 | buildIdeaMenu | One loose card: a thought the reader put on the canvas rather than in a |
| 18084 | ideaMenuItem | One line of that menu. |
| 18113 | buildSessionMenu | The verbs on a conversation card that are not worth a seat of their own. |
| 18144 | placeCardMenu | One line of that menu. |
| 18161 | cardMenuItem | } |
| 18189 | buildBoardLooseCard | } |
| 18536 | boardJoinText | Join a card's two parts back into the one string the store keeps. |
| 18555 | beginBoardCard | Start typing into one loose card - at its title, or at its body. |
| 18595 | boardTakeCardText | Keep what the open field says, and close it. |
| 18612 | commitBoardCard | } |
| 18625 | cancelBoardCard | Throw the open field away, leaving the card as it was last written. |
| 18646 | settleBoardCardForPress | Settle the open card field for a press, without the paint a settle |
| 18663 | addBoardCardAt | Write a new card at a place, and start typing in it. |
| 18685 | addBoardCard | Write a new card where the reader is looking, or below everything when the |
| 18702 | removeLooseCard | Take one loose card off the canvas. |
| 18747 | removeBoardCard | Take one conversation off the board. |
| 18789 | handleOf | A press on a block's heading: the handle the panel is dragged by. |
| 18818 | beginStackedCarrier | Lift one card out of a conversation's column, where the hand is. |
| 18857 | stackCardBefore | The card a drop should sit above, from where the pointer let go. |
| 18885 | closeIdeaMenu | Mark the column the hand is over, or clear every mark. |
| 18902 | closeSeatMenu | Put the colour wheel away, without a repaint. |
| 18922 | closeGoalMenu | Put a goal's ⋯ menu away, without a repaint. |
| 18941 | closeSessionMenu | Put a conversation card's menu away, without a repaint. |
| 18957 | paintStackDrop | } |
| 18975 | paintHeadDrop | Light the heading of the goal a carried card would start a conversation in. |
| 18994 | parkCardOutside | Give a card lifted out of a column a place on the paper. |
| 19021 | boardPointerDown | The one press handler on the canvas. |
| 19169 | boardNoteDone | Put the drop bands on screen, or take them away. |
| 19177 | showDropZones | } |
| 19192 | boardListen | Start listening for the rest of a gesture, once it has been armed. |
| 19209 | beginSessionGrab | Start a session drag: a sort inside its own panel, a carry outside it. |
| 19227 | beginSessionReorder | Sort one conversation among its neighbours, where the hand is. |
| 19282 | paintSessionReorder | Follow the hand, and let the other columns make room as it passes them. |
| 19309 | leaveSessionReorder | Hand the drag back to the carrier, because the pointer left the panel. |
| 19322 | resetSessionReorder | Put every column back where the paint left it. |
| 19343 | commitSessionReorder | Write the order the hand chose, once, and draw it. |
| 19373 | beginSessionCarrier | Give a carried card its body, where the hand is. |
| 19415 | onBoardMove | Follow the pointer: pan the paper, or carry what the hand picked up. |
| 19527 | onBoardUp | Let go: write down what the gesture decided, unless it never moved. |
| 19750 | handCardToSession | Hand one loose card's words to a conversation, and leave a trace behind. |
| 19776 | nameSessionForCard | Let the conversation a card was handed to wear the card's own name. |
| 19806 | drawCardLinks | Draw the elbow from every branch back to the conversation it was cut from. |
| 19862 | cancelBoardDrag | Drop the gesture and put back what it was carrying. |
| 19872 | endBoardDrag | Take the gesture's furniture off the page and forget it. |
| 19914 | onBoardBlurDrag | The window losing focus mid-gesture: the pointer left with it. |
| 19929 | onBoardDoubleClick | A double click on the paper: write a card right there. |
| 19975 | makeNotice | The transient line the plugin speaks in. |
| 20198 | showToast | Say one thing for a moment. A second press replaces the line and restarts |
| 20203 | hideToast | Take the notice down and drop the pending timer. |
| 20217 | SendHintLine | The line that names the send key, contributed to the shell's own dock row |
| 20249 | sendKeyLabel | The modifier this machine's send accelerator lives on, named the way the |
| 20268 | modelDirectories | The host's session model-selection service, when it publishes one. |
| 20284 | effortLevels | The reasoning levels one model offers, in the order the composer's own |
| 20308 | levelIndex | Where one level sits in the list. An explicit selection wins; without one |
| 20329 | currentLevelId | The level in effect for one selection, read the way the composer's own |
| 20340 | isCurrentEntry | Whether one entry is the model the conversation is already on. |
| 20358 | rowMarkedLevel | The level one picker row shows as marked, which is the level it would end |
| 20378 | rowSubmitLevel | The level one picker row would submit if it were confirmed without the |
| 20391 | refusal | A refusal this plugin can explain on its own, so the notice carries |
| 20410 | cycleEffort | One press of the reasoning key: step the visible conversation's level one |
| 20444 | stepEffort | Read the levels off one session directory and submit the next one. |
| 20494 | catalogGroups | Every provider/model the host currently advertises, for the settings page. |
| 20532 | groupsOf | The provider groups out of one loaded catalog or directory snapshot. Both |
| 20550 | offeredModels | The catalog as a lookup, one entry per `provider/model`. |
| 20588 | modelEntries | The configured models the directory currently offers, in the order the |
| 20600 | modelIndex | Where one model sits in the list; -1 when it is not one of them. |
| 20617 | modelDirectoryOfCurrent | Resolve the model directory behind the conversation on screen. |
| 20648 | readModelList | Read the list off one session directory. |
| 20692 | readNewSessionModelList | The list the sheet's model row offers. |
| 20715 | openNewSessionModelPick | Open the model window for the sheet's model row. |
| 20755 | openModelPick | One press of the model key: open the picker on the list of models the |
| 20967 | modelPickHint | The line under the picker: what it is showing, and what the keys do. |
| 20996 | renderModelPick | Repaint the picker's rows and footer from `MODELPICK.entries`. |
| 21019 | markedLevel | The level one row is currently marked with. |
| 21034 | confirmLevel | The level one confirm would submit. |
| 21057 | buildModelRow | One row of the picker: the model's name with the `current` tag in front of |
| 21112 | buildLevelCell | The levels of one model. |
| 21165 | levelClickHandler | The press handler for one level chip. |
| 21179 | keepModelPickVisible | Keep the selected row in sight when the list is longer than the card. |
| 21201 | openModelWindow | Mount the picker, with the selection already on the model in effect. |
| 21267 | closeModelPick | Unmount the picker and forget everything it was showing. |
| 21303 | moveModelPick | Move the picker's selection, wrapping at both ends. |
| 21331 | moveModelPickEntry | Put the selected model somewhere else in the list, and remember it there. |
| 21371 | reorderFavorites | Put an ordered list of pairs back into the configured one, in the new |
| 21399 | stepModelPickLevel | Step the level of the selected row, wrapping at both ends. |
| 21428 | confirmModelPick | Confirm the selected row: submit its model at its marked level, then take |
| 21493 | modelToast | The one-line notice after a switch, naming the level when the row has one. |
| 21505 | levelName | The readable name of one level of one model, or null when there is none. |
| 21527 | modelPickKeyDown | Route one keystroke to the open picker. |
| 21605 | switchModel | Read the catalog off one session directory and submit the model and level |
| 21706 | makeTranslator | Translate through the locale seat when it is wired, else through the |
| 21722 | KeyRow | One rebindable key: focus the box, press the key you want. |
| 21762 | SliderRow | One numeric preference. |
| 21792 | ChoiceRow | A short set of mutually exclusive options, as a row of toggles. Used for |
| 21838 | ModelListGroup | The switchable models as one settings group: what is chosen, in the order |
| 22031 | VimSection | The whole Settings → Vim scrolling page. |
| 22271 | BoardPage | The board as the main panel's page. |
| 22306 | BoardPanelIcon | The sidebar entry's glyph: three columns, which is what the board is. |
| 22351 | installBoardPage | Contribute the board as a sidebar entry and a main panel. |
| 22410 | installWindowCSS | The rules every window this plugin mounts shares, once. |
| 22454 | installBoardCSS | Put the board's hover and motion rules on the page, once. |
| 22625 | installSettings | Contribute the settings page and its vocabulary. Both contributions are |
| 22701 | makeApi | Debug and tuning surface, also used by tools/selftest.mjs. |
| 23035 | apply | Client activation. |
