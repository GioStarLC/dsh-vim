# MAP - lib/client.js

由 `npm run map` 生成，不要手改。找一个功能的入口：先在这里按名字查到行号，再读那一段。

lib/client.js：23948 行，482 个顶层函数。

| 行 | 函数 | 上方注释 |
|---:|---|---|
| 1317 | localeIsZh | Best-effort locale guess, used for the nav label and fallback strings. |
| 1341 | defaults | Shipped defaults as a fresh object, derived from DEFAULTS so a new |
| 1351 | copy | Current preferences as a fresh object. |
| 1375 | isBindableKey | A single printable character, or one of `NAMED_KEYS`, is the only thing |
| 1391 | normalizeKey | Normalise a bound key to its stored form: lower case for characters, |
| 1407 | keyLabel | How a bound key reads in the settings box. A space is invisible in a box |
| 1414 | clampNumber | Clamp a numeric preference to its accepted range. |
| 1430 | sanitizeFavorites | The switchable models as a fresh list of `{provider, model}` pairs. |
| 1449 | persist | Persist the current preferences; storage failures are not fatal. |
| 1458 | announce | Notify the settings page that preferences changed. |
| 1473 | applyPatch | Validate and apply one patch. Rejected patches leave preferences intact. |
| 1547 | firstFree | The preferred key when it is free, else the first free letter. |
| 1567 | repairKeys | Force each key group to be conflict-free. Groups are repaired back to |
| 1631 | migrateArchiveSeat | Move the archive seat into place for a store written before it existed. |
| 1647 | load | Read stored preferences over the defaults. |
| 1700 | setStage | Mark one conversation, or take the mark off it, and repaint. |
| 1717 | stageHandler | The press handler for one stage word on one row. |
| 1734 | cyclePhase | Advance one conversation to the next stage, and repaint the window. |
| 1745 | subscribe | Subscribe to preference changes. |
| 1782 | isEditable | True when the element consumes printable characters itself. |
| 1796 | isScrollable | True when the element is a non-editable box that overflows vertically and |
| 1809 | parentOf | Parent element, crossing shadow boundaries through the host node. |
| 1820 | scrollerFrom | Nearest scrollable ancestor, inclusive. |
| 1830 | largestScroller | Largest visible scroll container; the last-resort target. |
| 1853 | elementAt | The topmost element at a point, when the document can be asked. A host |
| 1874 | pickScroller | Choose the container to scroll. Deterministic order: whatever sits under |
| 1898 | canMove | Whether the container still has room in the requested direction. |
| 1910 | resolveTarget | Walk from the picked container up to the first one that can move. This is |
| 1920 | reducedMotion | Honour the OS "reduce motion" preference. |
| 1930 | suppressSmooth | Pin `scroll-behavior: auto` for the animated element. Without this, a |
| 1939 | stopAnim | Stop the animation loop and restore anything it changed. |
| 1956 | frame | One animation frame: ease `current` toward `target`, frame-rate |
| 1982 | push | Queue a scroll step. Resolves (or reuses) the container, extends the |
| 2009 | stopHold | Cancel the held-key auto-repeat. |
| 2021 | tickHold | Auto-repeat tick: one more step, then schedule the next sooner. |
| 2042 | startHold | Start a hold: one immediate step, then our own accelerating repeat. The |
| 2059 | directionOf | Which direction a pressed key drives, if any. |
| 2074 | onKeyDown | Capture-phase key handler. Runs before the app's own handlers so the |
| 2452 | onKeyUp | Any keyup ends the hold, so a dropped keyup cannot leave the view scrolling. |
| 2478 | onEscapeBlur | Escape leaves a focused composer, so the scroll keys come back. |
| 2503 | onPointerMove | Remember where the pointer is. |
| 2524 | forgetPointer | Forget the remembered pointer, so the focus and centre rules decide again. |
| 2529 | onUserScroll | The user took over with the wheel or a touch: abandon our animation. |
| 2548 | onFocusLoss | Losing the window or the tab must not leave a hold or a stale pointer |
| 2997 | makeTurnPeek | The ledger behind `TURNS`, and the only thing that touches it. |
| 3121 | makePhaseLedger | The ledger behind `PHASES_MODEL`, and the only thing that touches the |
| 3236 | makeRunLedger | The ledger behind `RUNS`, and the only thing that touches it. |
| 5720 | applyBoardPageInk | Paint the page with the host's theme. |
| 5772 | sizePanel | Fit the panel to the configured size. |
| 5785 | placementMargin | How far the panel is held off the edge it is parked against. |
| 5797 | placePanel | Park the panel according to the configured position. The one place that |
| 5825 | serviceOf | One host service, however this context publishes it. These two are read |
| 5844 | taskServices | The session feed, the workspace registry, and the workspace navigator. |
| 5873 | statusFor | The shell's unified status entry for one conversation, if it publishes one. |
| 5890 | currentSession | The conversation on screen, as the shell's own shortcuts see it: the one |
| 5910 | currentSessionRunning | True when the conversation on screen has a turn in flight. |
| 5978 | watchEntries | Follow the conversation on screen for the life of the page, so an |
| 6005 | noteEntry | Start the arrival of one conversation, unless this one already had its |
| 6021 | cancelEntry | Drop the pending placement without touching what was already decided. |
| 6031 | stopEntries | Stop following arrivals; the next page arms its own watch. |
| 6055 | settleEntry | One frame of an arrival: wait until the page shows this conversation at |
| 6135 | entryRunning | Whether the conversation still has a turn in flight, or null while the |
| 6153 | lastInputRow | The last message a person wrote in the transcript, if one is on screen. |
| 6174 | entryScroller | The box a transcript row scrolls in: the nearest ancestor that declares |
| 6195 | anchorEntry | Put one transcript row at the top of its scrollport, within the box's |
| 6222 | settleEntryScroll | Let the shell treat the placement as a finished reading move. |
| 6244 | statusOf | What one conversation is doing right now, as a short label. |
| 6264 | turnsOf | The turn count already peeked for a conversation, or null. |
| 6274 | statusIsLive | True for the statuses that mean a turn is in flight: one that is running, |
| 6302 | noteDeliveries | Note the turn ends: a conversation this page watched run, no longer running. |
| 6328 | syncRuns | } |
| 6345 | watchRuns | Follow the status source for the life of the page, so a turn is stamped |
| 6368 | loadRunStamps | Read the stamps the previous page left behind, dropping the ones that are |
| 6376 | forgetRuns | Stop watching, and forget every stamp the watch had taken. |
| 6385 | runSince | The moment the turn in flight in one conversation was seen to start. |
| 6401 | elapsedText | How long a turn has been in flight, at minute resolution. |
| 6419 | tickClocks | Repaint the live chips, in place. |
| 6449 | clockDelay | Milliseconds until the next whole minute of the oldest clock given. |
| 6460 | startClock | Start the tick that keeps the clocks on screen honest. |
| 6471 | stopClock | Stop the tick: the window closed, or nothing on screen is running. |
| 6509 | donePulseAmount | How far into the beat `progress` (0..1) is, as a 0..1 swell. |
| 6523 | paintDonePulse | Paint the beat on every "just finished" chip on screen. |
| 6539 | tickDonePulse | One frame of the beat; schedules the next, or puts the chips back. |
| 6563 | startDonePulse | Start the beat, unless there is nothing to point at or the OS asked for |
| 6571 | stopDonePulse | Cancel the beat and put every chip it touched back. |
| 6589 | requestTurns | Queue a turn count for every loaded row that does not have one yet. |
| 6602 | drainPeeks | Start as many queued peeks as the concurrency budget allows. |
| 6621 | peekTurns | Read one session's `sessionStats.turns` and let go of it again. |
| 6690 | cancelPeeks | Drop every queued and in-flight peek; the window closed or unloaded. |
| 6695 | paletteText | Built-in string for the task window; it is plugin chrome, not shell copy. |
| 6706 | relativeTime | Coarse "how long ago" for a row. Deliberately four buckets, so a list |
| 6717 | paletteHint | Footer hint, rebuilt from the live bindings and the current depth. |
| 6776 | paletteHeadline | The one line above the list: what is on the reader's plate right now. |
| 6806 | conversationPool | Every conversation worth offering, newest first. |
| 6853 | sortByRecency | Sort rows by recency, newest first, with the id as a deterministic |
| 6872 | hereIndex | Where the conversation on screen sits in a list, or 0 when it is not |
| 6898 | firstOwedIndex | Where the selection opens: the first thing waiting on the reader, else |
| 6931 | attentionOf | Which attention block a conversation belongs to, or null for the plain |
| 6975 | paletteBlocks | Split the pool into the attention blocks and the browsing blocks. |
| 7051 | waitedSince | How long a conversation has been waiting on the reader, as a stamp. |
| 7070 | revealMore | Reveal one more batch of older conversations. |
| 7115 | paletteSections | The blocks to draw, in order, each with its header. |
| 7154 | rebuildRows | Rebuild `rows` and `sections` from the two blocks. |
| 7180 | folderIndex | Which folder each conversation lives in, as `{ label, path }` keyed by |
| 7217 | folderById | One workspace, by the id the board files its goals under. |
| 7249 | workspaceForGoal | The workspace a new conversation started from one goal would join. |
| 7278 | boardBlockByKey | One goal of the last paint, by the key a card is filed under. |
| 7292 | folderLabel | What a folder reads as on a row: the Workspace's own title, else the last |
| 7324 | rowColumns | The row grid: the state chip, the name, and the metadata — tag, stage, |
| 7344 | columnOf | The grid column one cell belongs to, on this repaint. |
| 7357 | widestCell | The widest content width among one column's cells. |
| 7383 | fitColumns | Give every row the same tracks, sized to what is actually on screen. |
| 7415 | namesOwnFolder | Whether a row in this block has to name its own folder. |
| 7427 | buildRow | One list row. Clicking it switches, so the window is not keyboard-only. |
| 7611 | buildRenameInput | The name box that replaces a row's title while it is being renamed. |
| 7646 | focusRename | Put the caret in the name box, with the whole name selected the first time |
| 7670 | beginRename | Start renaming the selected conversation. |
| 7679 | cancelRename | Drop the edit and repaint the row as it was. |
| 7693 | commitRename | Hand the typed name to the host. |
| 7730 | renameSession | Rename one conversation, the way the shell's own sidebar does it: retain |
| 7780 | archiveSession | Archive the selected conversation, through the host's own action. |
| 7820 | archiveFailureText | A reason from whatever the host rejected an archive with. |
| 7841 | archiveSelected | Archive the selected row, with the footer saying what happened. |
| 7862 | failureText | A short reason from whatever the host rejected with: a remote failure |
| 7874 | setPaletteNotice | Say something in the footer. The next repaint restores the hint, so a |
| 7889 | resetPaintScratch | Put this repaint's measurements away, ready for the next one. |
| 7905 | renderPalette | Repaint the list from `PALETTE.sections`; cheap enough at this size. |
| 7976 | moreReachable | Whether the "More" seat has anything left to give. |
| 7993 | buildSectionHeader | One block heading. It is not selectable and not a row: it names the block |
| 8037 | scrollSelectionIntoView | Keep the cursor visible when the list is longer than the panel. |
| 8051 | moreHeadingNode | The "More" heading element currently on screen, or null. |
| 8077 | refreshPalette | Re-read both feeds, holding the selection on the same conversation and |
| 8123 | selectedRow | The conversation under the cursor, or null when the cursor is standing on |
| 8139 | moreSeatAt | Where the "More" seat stands in the row order, as a row index. |
| 8162 | moveSelection | Move the selection, wrapping at both ends. |
| 8206 | activateSelection | Act on whatever the selection is standing on. |
| 8218 | openPalette | Mount the window and read the feed. Rolling state is torn down first: |
| 8330 | closePalette | Unmount the window and drop every feed subscription. |
| 8390 | paletteKeyDown | Route one keystroke to the open window. |
| 8514 | composerRoot | The message box: the rich-text editor root the shell puts the caret into. |
| 8531 | rememberComposer | Remember the element a focus landed on. It is the fallback for a host |
| 8548 | isComposerEditor | True when an element is a rich-text editor, i.e. the message box — and |
| 8564 | noteFocusRequest | Mark that the user just asked for the keyboard themselves, so the focus |
| 8583 | clearFocusRequest | Drop a request the user has just superseded by doing something else. |
| 8598 | isActivating | True for a control a bare Space activates by itself. Such a control keeps |
| 8611 | focusComposer | Put the keyboard in the message box: what the focus key is for. |
| 8636 | composerIsEmpty | True when the message box holds nothing the user put there. |
| 8659 | leaveEmptyComposer | The focus key pressed again, inside the box it put the caret in: hand the |
| 8687 | inComposer | True when a keystroke was aimed at the message box. |
| 8710 | menuOpen | True while a suggestion menu is waiting to be confirmed. |
| 8739 | onSendKey | True when this keystroke is a send, and the keyboard should not stay in |
| 8768 | doubleEnterSends | True when this Enter is the second half of a double-Enter send. |
| 8798 | sendFromComposer | Send the draft by handing the host the key it already sends with. |
| 8849 | handBackAfterSend | Give the keyboard back to the page after a send, without waiting for a |
| 8880 | breakLine | Turn a bare Enter into the host's own line break. |
| 8934 | onFocusIn | Keep the message box from taking the keyboard on its own. |
| 8960 | noteFocusReturn | Widen the licence to a focus arriving right after the window got the |
| 8972 | justReturned | Whether a focus arriving now is the tail of the window coming back. |
| 8984 | onPointerDown | A press says where the keyboard should be: inside a text field it asks |
| 9009 | dismissOutsidePress | Put an open window away when the press landed beside it. |
| 9035 | pressMissesWindow | Whether a press landed outside an open window's card. |
| 9047 | activateSession | Switch the main view to one conversation. |
| 9103 | reportStoreFull | Say that the board could not be written, once. |
| 9110 | makeBoardStore | } |
| 10627 | makeHistory | The board's history: what was done, and how to put it back. |
| 10751 | makeNoteStore | The lines pinned to conversations, and the only thing that touches them. |
| 10892 | makeHistoryStore | The history's own store: one record per local day, in IndexedDB. |
| 11073 | makeJournal | The sessions a day inherited, kept where a repaint can reach them. |
| 11248 | makeCarryStore | } |
| 11343 | dayOf | The local day a moment belongs to, as `YYYY-MM-DD`. |
| 11352 | daysBetween | How many local days lie between two `YYYY-MM-DD` days. |
| 11362 | readMoment | The page the board last drew, as it was left, or null. |
| 11376 | forgetMoment | Forget the page that was left, once it has been filed. |
| 11400 | noteMoment | Remember the page this repaint draws. |
| 11424 | momentHeld | Whether the store still holds exactly the bytes this page last wrote. |
| 11443 | pageDoc | The arrangement a day's page keeps. |
| 11469 | pageView | The page as it reads, frozen. |
| 11519 | settleDay | File the page that was left, and start today. |
| 11554 | filePage | Write one page, and keep the history's size honest. |
| 11587 | settleCarry | Carry the members of the page just filed into today. |
| 11604 | pruneHistory | Keep the newest `snapshotKeepDays` pages, and no more. |
| 11622 | dropCarried | Let go of the conversations carried longest with no movement. |
| 11650 | maybeShowSeal | Show the day that just ended, once, the first time the board is up after it. |
| 11672 | sealCounts | The counts one day's summary reads off. |
| 11693 | sealLeft | What the desk still owes the reader, as of this press. |
| 11722 | paintSeal | Draw one day's summary. |
| 11798 | closeSeal | Take the day's summary down. |
| 11809 | historySearchRow | The one-line search above the days. |
| 11842 | searchHistory | Find a sentence across the pages, newest first. |
| 11884 | historyMatches | The lines of one page that carry the needle: its cards, its notes, its names. |
| 11912 | historyHitRow | One page a search found, with the lines it was found by. |
| 11950 | openBoardHistory | Open the history: the pages the board has been. |
| 12023 | closeBoardHistory | Take the history panel down, whichever page it was showing. |
| 12045 | renderHistory | Draw the list of days. |
| 12072 | historyNote | One quiet sentence where a page would be. |
| 12080 | historyMeta | How a page reads at a glance: what it was made of. |
| 12091 | historyDayRow | One day in the list, and its page once it is opened. |
| 12119 | historyDetail | One day's page, as it read: its goals, their conversations, its cards. |
| 12245 | restoreDay | Copy one page into today. |
| 12270 | applyPageOrder | Put the page's own arrangement back onto the panels. |
| 12288 | settleRestoredCarry | Seat a restored page's members as today's carried set. |
| 12302 | keepBackup | Keep what a restore or an import is about to replace. |
| 12315 | takeBeforeBackup | Take back what the last restore or import replaced. |
| 12333 | downloadJson | Hand a file to the browser. |
| 12367 | exportHistory | Write the board, its notes and every page into one file. |
| 12398 | pickHistoryFile | Ask for one file, and take it in when it arrives. |
| 12433 | importHistory | Take in one exported file. |
| 12478 | toggleBoard | The board the plugin opens when a page is not available. |
| 12491 | showBoard | } |
| 12517 | pointInSelection | Whether one right press landed inside the words the reader selected. |
| 12558 | onContextMenu | The way back from a conversation: a right press on its page. |
| 12578 | beginBoardNote | Start typing the line on one card. |
| 12591 | commitBoardNote | Keep what the open field says, and close it. |
| 12606 | cancelBoardNote | Throw the open field away, leaving the card as it was. |
| 12622 | openNote | The note key: open the board on the conversation on screen, with its |
| 12659 | pinToBoard | Put one conversation on the board by hand. |
| 12685 | startOfToday | Midnight today, in the reader's own zone. |
| 12719 | goalByKey | The canvas as it is drawn: one block per workspace in play, the |
| 12745 | nextGoalName | The name a goal cut from a card starts with: the one it came from, plus |
| 12766 | cardVerdictOf | What the reader has said about a conversation, if it still applies. |
| 12784 | noteCardFinished | Write down that a turn ended, before the shell forgets it did. |
| 12809 | warmCard | Whether a conversation is still warm, and so stands above the rule. |
| 12820 | boardBlocks | } |
| 13003 | rememberFork | Record a fork this plugin watched, and repaint a board that is up. |
| 13027 | inheritForkHome | File a branch in the goal its parent is in. |
| 13050 | revealBoardCard | Bring one card into view, without moving the paper any further than it |
| 13073 | watchForks | Watch the sessions service for forks, so a branch made anywhere in the |
| 13113 | boardPlaces | The places the blocks will be drawn at. |
| 13143 | firstFreeSlot | The first place on the paper no block already stands on. |
| 13175 | slotTaken | Whether a block already stands on a place. |
| 13201 | boardPanelHeights | How tall each painted panel stands, keyed by the block it is. |
| 13222 | boardPanelWidths | How wide each painted panel stands, keyed by the block it is. |
| 13248 | boardExtent | How big the stage has to be to hold everything on it. |
| 13276 | applyBoardZoom | Put the canvas's magnification on the paper. |
| 13299 | setBoardZoom | Zoom the canvas, keeping one point of it where it is on screen. |
| 13321 | onBoardWheel | Ctrl/Cmd + wheel zooms the canvas, the way every canvas does. |
| 13341 | nextCardPlace | Where a new loose card goes when the reader did not point at a place. |
| 13372 | boardFreePlace | A place on the paper for a goal that was just asked for, near the eye. |
| 13415 | addBoardGoal | Stand a new goal on the canvas, ready to be given a purpose. |
| 13437 | closeNewSessionSheet | Take the new-conversation sheet down, and forget what it was writing. |
| 13462 | paintNewSessionBusy | Put the sheet's confirm button in step with the one host round trip. |
| 13478 | paintNewSessionModel | Say which model the sheet would start the conversation on. |
| 13502 | paintNewSessionField | Paint one of the sheet's fields as focused or not. |
| 13513 | watchNewSessionField | Let a field say where the caret is, for as long as it lives. |
| 13528 | openNewSessionSheet | Show the sheet that asks for a conversation's name and the words it opens with. |
| 13737 | commitNewSessionSheet | Read the sheet and start the conversation it describes. |
| 13771 | applyNewSessionModel | Put the model the sheet was set to onto the conversation just made. |
| 13813 | startNewSessionForGoal | Start one conversation under one goal, with the reader's words. |
| 13915 | tidyPanels | The panels as a tidy sees them: a rectangle of paper, the conversations |
| 13986 | tidyHomeOf | Which panel a card belongs beside, if any. |
| 14011 | tidyColumnX | The first x at or right of `x` that no panel already stands in. |
| 14029 | tidyBySession | The order cards stand in beside their panel: the panel's own order. |
| 14035 | tidyByTray | The order the inbox tray keeps: what is finished sinks to the bottom. |
| 14055 | tidyGroup | Lay one group of cards out as a column beside its panel. |
| 14118 | tidyPlan | Where every idea card belongs, as a list of places and a list of put-aways. |
| 14161 | tidyBoard | Tidy the canvas: put every idea card where it belongs, and leave the |
| 14213 | glideTidyBatch | Fly one tidy's cards to their places, a beat apart. |
| 14271 | openBoard | Mount the board. |
| 14320 | mountBoardInto | Build the board's parts into a root element, whichever mount owns it. |
| 14580 | unmountBoard | Unmount the board, whichever mount holds it. |
| 14684 | closeBoard | Take the floating board down, element and all. |
| 14711 | boardFieldOpen | Repaint the whole canvas from the feeds. |
| 14737 | renderBoard | } |
| 14954 | boardStatusFingerprint | The board's reading of every card's status, as one string. |
| 14975 | renderBoardOnStatus | Repaint the board for a status tick, but only if something on screen |
| 14990 | tickBoardClocks | Move the running cards' minute hands, in place. |
| 15013 | startDayTimer | Arm the one timer that watches for midnight. |
| 15028 | stopDayTimer | Stop the midnight timer: the board closed, or the page went away. |
| 15035 | startBoardClock | Start the tick that keeps the board's clocks honest. |
| 15046 | stopBoardClock | Stop the tick: the board closed, or nothing on it is running. |
| 15060 | requestBoardTurns | Ask for the turn counts the board is missing. |
| 15090 | paintHistory | Paint the "only what is marked" toggle to match the state it stands for. |
| 15105 | paintBoardStarFilter | } |
| 15122 | slotHue | One workspace on the canvas: a heading that can be dragged, and the |
| 15135 | slotSeed | Which seat a block starts on: its own id, never its name. |
| 15152 | boardSlots | Give every panel on this paint its own slice of the wheel. |
| 15187 | blockSeat | The seat one block wears: the one written down, else the one this paint gave it. |
| 15207 | goalHue | The hue one place is washed with, or null for the tray. |
| 15213 | blockInk | The colour one panel's own mark wears. |
| 15230 | noteHue | The paper one note is written on. |
| 15234 | notePaper | } |
| 15261 | noteInkOf | The ink one note is drawn in. |
| 15361 | boardIcon | One of those glyphs, at a size, as an element. |
| 15418 | boardNoteCols | How many rows an idea card's field needs for what it holds. |
| 15424 | boardTextRows | } |
| 15449 | boardEditorRows | The lines a card's field opens on. |
| 15477 | boardNoteMetrics | How much paper one idea card takes. |
| 15511 | noteParts | How much paper one idea card takes: its heading, and the lines it holds. |
| 15531 | boardCardBox | How much paper one idea card takes at rest. |
| 15557 | boardCardOpenBox | The paper a note takes while its field is up: all of its body, up to the cap. |
| 15579 | canvasPointOf | Where a point on the screen falls on the paper. |
| 15601 | raiseBoardCard | Bring one card to the front of the paper. |
| 15621 | beginNoteLift | Lift one put-away note out of the tray, under the hand. |
| 15671 | markDropGoal | Say which goal would take the card if the hand let go of it here. |
| 15686 | boardHomeOf | The goal one conversation is drawn in on this paint, or null. |
| 15708 | markNoDrop | Say, under the hand, that the paper will not take this card. |
| 15734 | dropNoDropTip | Take the "the paper will not take it" line off the page. |
| 15753 | goalNodeAt | The goal panel under a native drag, asked in the order a browser answers. |
| 15765 | nearestGoal | The goal panel an element stands in, or null when it stands in none. |
| 15781 | goalUnder | The goal the pointer is standing in, as the id a card is filed under. |
| 15797 | goalHeadKeyUnder | The goal whose heading an element stands in, as the key a card starts a |
| 15822 | boardDragHasText | Whether a native drag carries words, the one thing the shell's rows set. |
| 15860 | sessionInPayload | The words a native drag is carrying, read where the browser allows it. |
| 15887 | boardDragText | } |
| 15905 | clearBoardDragGoal | Take the goal highlight a native drag drew off the paper. |
| 15922 | onNativeDragEnd | A native drag is over, however it ended. |
| 15936 | onBoardDragOver | Say, while a native drag is over the canvas, which goal would take it. |
| 15952 | onBoardDragLeave | The native drag left the canvas: take the goal highlight with it. |
| 15972 | onBoardDrop | A conversation let go on the canvas, carried in from the host's sidebar. |
| 15999 | dropSessionOntoBoard | Take one conversation the reader dragged in, and keep it. |
| 16024 | buildSeatMenu | The twelve colours a goal can wear. |
| 16057 | pickSeat | One colour, as a press. |
| 16082 | buildGoalMenu | The verbs on a goal that are not worth a seat of their own. |
| 16105 | goalMenuItem | One line of that menu. |
| 16136 | placeGoalMenu | Stand a goal's menu under its ⋯, inside the panel's right edge. |
| 16141 | buildBoardBlock | } |
| 16545 | trayCaption | The conversations of one block, cut into threads. |
| 16560 | trayQuiet | A quiet line where a section has nothing in it yet. |
| 16578 | buildTrayNote | One note, as a line of the tray. |
| 16726 | trayInk | Ink every conversation inside one node with the tray's paper. |
| 16738 | doneBinCards | Every note put away in the finished-cards bin, newest first. |
| 16743 | doneBinCardsOf | The put-away notes one conversation was handed, newest first. |
| 16762 | openDoneBinFor | Open the bin on one conversation's own put-aways. |
| 16777 | paintDoneBin | Say how many cards the bin holds, and what it is doing. |
| 16792 | toggleDoneBin | Open or close the finished-cards list. |
| 16810 | buildDoneRow | One finished note, as a line of the card's list. |
| 16897 | mountDoneBin | Put the finished-cards list on the board, or take it away. |
| 16985 | ejectFromDoneBin | Put one card back on the paper, out of the finished-cards bin. |
| 17004 | buildInboxBody | The tray's body: the conversations nothing accounts for, and the notes put away here. |
| 17049 | boardBlockColumns | How many columns a panel reads across. |
| 17065 | boardCardStacked | Whether one card is drawn inside a conversation's column. |
| 17088 | boardBlockWidth | How wide a panel stands. |
| 17112 | buildBoardColumns | A goal's conversations, laid out across the panel. |
| 17169 | buildBoardColumn | One conversation of a panel, as the column it stands in. |
| 17195 | buildPanelRule | The line between the cards still warm and the rest of what today touched. |
| 17236 | buildQuietStrip | The conversations a panel carried in and nobody has touched, one line each. |
| 17292 | buildQuietRow | One quiet conversation, as the line it is drawn as. |
| 17364 | buildQuietStack | The thoughts under one quiet conversation, once its count was pressed. |
| 17383 | buildBoardStack | The thoughts filed under one conversation. |
| 17449 | markCardFresh | Wear the one beat a completion is worth - once. |
| 17487 | verdictText | The word one conversation wears, in the reader's language. |
| 17504 | buildVerdictChip | What the reader said about a card, as the chip that says it. |
| 17531 | buildStateAdd | The empty seat, for a card the shell has nothing to say about. |
| 17551 | stateToggle | Open or close one card's state menu. |
| 17572 | buildVerdictMenu | The two words, and the way back to having said nothing. |
| 17592 | verdictItem | One word in that menu. |
| 17617 | clearVerdictItem | The row that takes the word back. |
| 17636 | buildBoardCard | } |
| 18106 | beginBlockRename | Start typing a goal's name into its heading. |
| 18112 | commitBlockRename | Keep the name the heading says, and close the field. |
| 18124 | cancelBlockRename | Throw the typed name away, leaving the goal as it was called. |
| 18141 | goalBaseName | The last piece of a workspace path: what the workspace is called. |
| 18154 | beginGoalIntent | Start writing what a goal is for. |
| 18169 | commitGoalIntent | Keep what the open line says, and close it. |
| 18181 | cancelGoalIntent | Throw the typed line away, leaving the goal as it was. |
| 18200 | removeBoardGoal | Take one goal off the canvas, with a few seconds to bring it back. |
| 18247 | boardNameCollisions | Which drawn cards share a name, and where each one stands in its group. |
| 18273 | boardTitleOf | The name one card wears: the reader's word while the shell catches up, |
| 18289 | noteCardTitle | Put the reader's word on a card before the shell has answered. |
| 18304 | settleTitles | Let go of the stand-in names the feed has caught up with, or outlived. |
| 18323 | beginBoardRename | Start renaming one conversation from its card. |
| 18341 | commitBoardRename | Keep what the open name field says, and rename the conversation. |
| 18380 | cancelBoardRename | Throw the open name field away, leaving the conversation as it was. |
| 18399 | forkBoardCard | Start a branch from one conversation, and draw the line when it lands. |
| 18445 | returnForkMark | Let a conversation's branch mark answer again, and say so on the card. |
| 18461 | waitForBranchRow | The catalogue row for one conversation, asked for until it arrives. |
| 18493 | settleBranchName | Give a fresh branch a name nobody else is using, and answer with it. |
| 18536 | pasteIntoComposer | Put words in the message box of the conversation on screen. |
| 18570 | composerHasText | Whether the message box already holds something. |
| 18586 | boxHasText | Whether one box already holds words. |
| 18601 | seatCaretAtEnd | Put the caret at the end of the box's content. |
| 18640 | dropCardIntoComposer | Hand one loose card's words to a conversation's message box. |
| 18660 | pasteIntoBoxNow | Put the words in the box that is on screen right now, if there is one. |
| 18682 | putThroughEditor | Put text into the editor through the editing command. |
| 18701 | pasteThroughEvent | Put text into the editor as a real paste event. |
| 18740 | buildIdeaMenu | One loose card: a thought the reader put on the canvas rather than in a |
| 18776 | ideaMenuItem | One line of that menu. |
| 18805 | buildSessionMenu | The verbs on a conversation card that are not worth a seat of their own. |
| 18836 | placeCardMenu | One line of that menu. |
| 18853 | cardMenuItem | } |
| 18881 | buildBoardLooseCard | } |
| 19228 | boardJoinText | Join a card's two parts back into the one string the store keeps. |
| 19247 | beginBoardCard | Start typing into one loose card - at its title, or at its body. |
| 19287 | boardTakeCardText | Keep what the open field says, and close it. |
| 19304 | commitBoardCard | } |
| 19317 | cancelBoardCard | Throw the open field away, leaving the card as it was last written. |
| 19338 | settleBoardCardForPress | Settle the open card field for a press, without the paint a settle |
| 19355 | addBoardCardAt | Write a new card at a place, and start typing in it. |
| 19377 | addBoardCard | Write a new card where the reader is looking, or below everything when the |
| 19394 | removeLooseCard | Take one loose card off the canvas. |
| 19439 | removeBoardCard | Take one conversation off the board. |
| 19481 | handleOf | A press on a block's heading: the handle the panel is dragged by. |
| 19510 | beginStackedCarrier | Lift one card out of a conversation's column, where the hand is. |
| 19549 | stackCardBefore | The card a drop should sit above, from where the pointer let go. |
| 19577 | closeIdeaMenu | Mark the column the hand is over, or clear every mark. |
| 19594 | closeSeatMenu | Put the colour wheel away, without a repaint. |
| 19614 | closeGoalMenu | Put a goal's ⋯ menu away, without a repaint. |
| 19634 | closeVerdictMenu | Put a card's state menu away, without a repaint. |
| 19653 | closeSessionMenu | Put a conversation card's menu away, without a repaint. |
| 19669 | paintStackDrop | } |
| 19687 | paintHeadDrop | Light the heading of the goal a carried card would start a conversation in. |
| 19706 | parkCardOutside | Give a card lifted out of a column a place on the paper. |
| 19733 | boardPointerDown | The one press handler on the canvas. |
| 19882 | boardNoteDone | Put the drop bands on screen, or take them away. |
| 19890 | showDropZones | } |
| 19905 | boardListen | Start listening for the rest of a gesture, once it has been armed. |
| 19922 | beginSessionGrab | Start a session drag: a sort inside its own panel, a carry outside it. |
| 19940 | panelHolds | Whether a hand is still close enough to its panel to be sorting inside it. |
| 19958 | beginSessionReorder | Sort one conversation among its neighbours, where the hand is. |
| 20023 | paintSessionReorder | Follow the hand, and let the other columns make room as it passes them. |
| 20061 | sessionSlotAt | The place the hand is asking for, read off the grid. |
| 20107 | leaveSessionReorder | Hand the drag back to the carrier, because the pointer left the panel. |
| 20120 | resetSessionReorder | Put every column back where the paint left it. |
| 20147 | commitSessionReorder | Write the order the hand chose, once, and draw it. |
| 20185 | beginSessionCarrier | Give a carried card its body, where the hand is. |
| 20227 | onBoardMove | Follow the pointer: pan the paper, or carry what the hand picked up. |
| 20339 | onBoardUp | Let go: write down what the gesture decided, unless it never moved. |
| 20571 | handCardToSession | Hand one loose card's words to a conversation, and leave a trace behind. |
| 20597 | nameSessionForCard | Let the conversation a card was handed to wear the card's own name. |
| 20627 | drawCardLinks | Draw the elbow from every branch back to the conversation it was cut from. |
| 20683 | cancelBoardDrag | Drop the gesture and put back what it was carrying. |
| 20693 | endBoardDrag | Take the gesture's furniture off the page and forget it. |
| 20735 | onBoardBlurDrag | The window losing focus mid-gesture: the pointer left with it. |
| 20750 | onBoardDoubleClick | A double click on the paper: write a card right there. |
| 20796 | makeNotice | The transient line the plugin speaks in. |
| 21019 | showToast | Say one thing for a moment. A second press replaces the line and restarts |
| 21024 | hideToast | Take the notice down and drop the pending timer. |
| 21038 | SendHintLine | The line that names the send key, contributed to the shell's own dock row |
| 21070 | sendKeyLabel | The modifier this machine's send accelerator lives on, named the way the |
| 21089 | modelDirectories | The host's session model-selection service, when it publishes one. |
| 21105 | effortLevels | The reasoning levels one model offers, in the order the composer's own |
| 21129 | levelIndex | Where one level sits in the list. An explicit selection wins; without one |
| 21150 | currentLevelId | The level in effect for one selection, read the way the composer's own |
| 21161 | isCurrentEntry | Whether one entry is the model the conversation is already on. |
| 21179 | rowMarkedLevel | The level one picker row shows as marked, which is the level it would end |
| 21199 | rowSubmitLevel | The level one picker row would submit if it were confirmed without the |
| 21212 | refusal | A refusal this plugin can explain on its own, so the notice carries |
| 21231 | cycleEffort | One press of the reasoning key: step the visible conversation's level one |
| 21265 | stepEffort | Read the levels off one session directory and submit the next one. |
| 21315 | catalogGroups | Every provider/model the host currently advertises, for the settings page. |
| 21353 | groupsOf | The provider groups out of one loaded catalog or directory snapshot. Both |
| 21371 | offeredModels | The catalog as a lookup, one entry per `provider/model`. |
| 21409 | modelEntries | The configured models the directory currently offers, in the order the |
| 21421 | modelIndex | Where one model sits in the list; -1 when it is not one of them. |
| 21438 | modelDirectoryOfCurrent | Resolve the model directory behind the conversation on screen. |
| 21469 | readModelList | Read the list off one session directory. |
| 21513 | readNewSessionModelList | The list the sheet's model row offers. |
| 21536 | openNewSessionModelPick | Open the model window for the sheet's model row. |
| 21576 | openModelPick | One press of the model key: open the picker on the list of models the |
| 21788 | modelPickHint | The line under the picker: what it is showing, and what the keys do. |
| 21817 | renderModelPick | Repaint the picker's rows and footer from `MODELPICK.entries`. |
| 21840 | markedLevel | The level one row is currently marked with. |
| 21855 | confirmLevel | The level one confirm would submit. |
| 21878 | buildModelRow | One row of the picker: the model's name with the `current` tag in front of |
| 21933 | buildLevelCell | The levels of one model. |
| 21986 | levelClickHandler | The press handler for one level chip. |
| 22000 | keepModelPickVisible | Keep the selected row in sight when the list is longer than the card. |
| 22022 | openModelWindow | Mount the picker, with the selection already on the model in effect. |
| 22088 | closeModelPick | Unmount the picker and forget everything it was showing. |
| 22124 | moveModelPick | Move the picker's selection, wrapping at both ends. |
| 22152 | moveModelPickEntry | Put the selected model somewhere else in the list, and remember it there. |
| 22192 | reorderFavorites | Put an ordered list of pairs back into the configured one, in the new |
| 22220 | stepModelPickLevel | Step the level of the selected row, wrapping at both ends. |
| 22249 | confirmModelPick | Confirm the selected row: submit its model at its marked level, then take |
| 22314 | modelToast | The one-line notice after a switch, naming the level when the row has one. |
| 22326 | levelName | The readable name of one level of one model, or null when there is none. |
| 22348 | modelPickKeyDown | Route one keystroke to the open picker. |
| 22426 | switchModel | Read the catalog off one session directory and submit the model and level |
| 22527 | makeTranslator | Translate through the locale seat when it is wired, else through the |
| 22543 | KeyRow | One rebindable key: focus the box, press the key you want. |
| 22583 | SliderRow | One numeric preference. |
| 22613 | ChoiceRow | A short set of mutually exclusive options, as a row of toggles. Used for |
| 22659 | ModelListGroup | The switchable models as one settings group: what is chosen, in the order |
| 22852 | VimSection | The whole Settings → Vim scrolling page. |
| 23092 | BoardPage | The board as the main panel's page. |
| 23127 | BoardPanelIcon | The sidebar entry's glyph: three columns, which is what the board is. |
| 23172 | installBoardPage | Contribute the board as a sidebar entry and a main panel. |
| 23231 | installWindowCSS | The rules every window this plugin mounts shares, once. |
| 23275 | installBoardCSS | Put the board's hover and motion rules on the page, once. |
| 23446 | installSettings | Contribute the settings page and its vocabulary. Both contributions are |
| 23522 | makeApi | Debug and tuning surface, also used by tools/selftest.mjs. |
| 23856 | apply | Client activation. |
