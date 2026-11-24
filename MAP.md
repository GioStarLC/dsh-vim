# MAP - src/client

由 `npm run map` 生成，不要手改。找一个功能的入口：先在这里按名字查到文件与行号，再读那一段。

源码：`src/client/`，6 个文件，513 个顶层函数。

| 文件 | 行 | 函数 | 上方注释 |
|---|---:|---|---|
| src/client/dom.js | 14 | isEditable | True when the element consumes printable characters itself. |
| src/client/dom.js | 28 | isScrollable | True when the element is a non-editable box that overflows vertically and |
| src/client/dom.js | 41 | parentOf | Parent element, crossing shadow boundaries through the host node. |
| src/client/dom.js | 52 | scrollerFrom | Nearest scrollable ancestor, inclusive. |
| src/client/dom.js | 62 | largestScroller | Largest visible scroll container; the last-resort target. |
| src/client/dom.js | 85 | elementAt | The topmost element at a point, when the document can be asked. A host |
| src/client/index.js | 73 | setStage | Mark one conversation, or take the mark off it, and repaint. |
| src/client/index.js | 90 | stageHandler | The press handler for one stage word on one row. |
| src/client/index.js | 107 | cyclePhase | Advance one conversation to the next stage, and repaint the window. |
| src/client/index.js | 127 | onKeyDown | Capture-phase key handler. Runs before the app's own handlers so the |
| src/client/index.js | 537 | onKeyUp | Any keyup ends the hold, so a dropped keyup cannot leave the view scrolling. |
| src/client/index.js | 563 | onEscapeBlur | Escape leaves a focused composer, so the scroll keys come back. |
| src/client/index.js | 588 | onPointerMove | Remember where the pointer is. |
| src/client/index.js | 609 | forgetPointer | Forget the remembered pointer, so the focus and centre rules decide again. |
| src/client/index.js | 614 | onUserScroll | The user took over with the wheel or a touch: abandon our animation. |
| src/client/index.js | 633 | onFocusLoss | Losing the window or the tab must not leave a hold or a stale pointer |
| src/client/index.js | 1104 | makeTurnPeek | The ledger behind `TURNS`, and the only thing that touches it. |
| src/client/index.js | 1228 | makePhaseLedger | The ledger behind `PHASES_MODEL`, and the only thing that touches the |
| src/client/index.js | 1343 | makeRunLedger | The ledger behind `RUNS`, and the only thing that touches it. |
| src/client/index.js | 4171 | applyBoardPageInk | Paint the page with the host's theme. |
| src/client/index.js | 4223 | sizePanel | Fit the panel to the configured size. |
| src/client/index.js | 4236 | placementMargin | How far the panel is held off the edge it is parked against. |
| src/client/index.js | 4248 | placePanel | Park the panel according to the configured position. The one place that |
| src/client/index.js | 4276 | serviceOf | One host service, however this context publishes it. These two are read |
| src/client/index.js | 4295 | taskServices | The session feed, the workspace registry, and the workspace navigator. |
| src/client/index.js | 4324 | statusFor | The shell's unified status entry for one conversation, if it publishes one. |
| src/client/index.js | 4341 | currentSession | The conversation on screen, as the shell's own shortcuts see it: the one |
| src/client/index.js | 4361 | currentSessionRunning | True when the conversation on screen has a turn in flight. |
| src/client/index.js | 4438 | watchEntries | Follow the conversation on screen for the life of the page, so an |
| src/client/index.js | 4465 | noteEntry | Start the arrival of one conversation, unless this one already had its |
| src/client/index.js | 4488 | cancelEntry | Drop the pending placement without touching what was already decided. |
| src/client/index.js | 4498 | stopEntries | Stop following arrivals; the next page arms its own watch. |
| src/client/index.js | 4523 | settleEntry | One frame of an arrival: wait until the page shows this conversation at |
| src/client/index.js | 4603 | entryRunning | Whether the conversation still has a turn in flight, or null while the |
| src/client/index.js | 4621 | lastInputRow | The last message a person wrote in the transcript, if one is on screen. |
| src/client/index.js | 4642 | entryScroller | The box a transcript row scrolls in: the nearest ancestor that declares |
| src/client/index.js | 4663 | anchorEntry | Put one transcript row at the top of its scrollport, within the box's |
| src/client/index.js | 4690 | settleEntryScroll | Let the shell treat the placement as a finished reading move. |
| src/client/index.js | 4712 | statusOf | What one conversation is doing right now, as a short label. |
| src/client/index.js | 4732 | turnsOf | The turn count already peeked for a conversation, or null. |
| src/client/index.js | 4742 | statusIsLive | True for the statuses that mean a turn is in flight: one that is running, |
| src/client/index.js | 4770 | noteDeliveries | Note the turn ends: a conversation this page watched run, no longer running. |
| src/client/index.js | 4796 | syncRuns | } |
| src/client/index.js | 4813 | watchRuns | Follow the status source for the life of the page, so a turn is stamped |
| src/client/index.js | 4836 | loadRunStamps | Read the stamps the previous page left behind, dropping the ones that are |
| src/client/index.js | 4844 | forgetRuns | Stop watching, and forget every stamp the watch had taken. |
| src/client/index.js | 4853 | runSince | The moment the turn in flight in one conversation was seen to start. |
| src/client/index.js | 4869 | elapsedText | How long a turn has been in flight, at minute resolution. |
| src/client/index.js | 4887 | tickClocks | Repaint the live chips, in place. |
| src/client/index.js | 4917 | clockDelay | Milliseconds until the next whole minute of the oldest clock given. |
| src/client/index.js | 4928 | startClock | Start the tick that keeps the clocks on screen honest. |
| src/client/index.js | 4939 | stopClock | Stop the tick: the window closed, or nothing on screen is running. |
| src/client/index.js | 4977 | donePulseAmount | How far into the beat `progress` (0..1) is, as a 0..1 swell. |
| src/client/index.js | 4991 | paintDonePulse | Paint the beat on every "just finished" chip on screen. |
| src/client/index.js | 5007 | tickDonePulse | One frame of the beat; schedules the next, or puts the chips back. |
| src/client/index.js | 5031 | startDonePulse | Start the beat, unless there is nothing to point at or the OS asked for |
| src/client/index.js | 5039 | stopDonePulse | Cancel the beat and put every chip it touched back. |
| src/client/index.js | 5057 | requestTurns | Queue a turn count for every loaded row that does not have one yet. |
| src/client/index.js | 5070 | drainPeeks | Start as many queued peeks as the concurrency budget allows. |
| src/client/index.js | 5089 | peekTurns | Read one session's `sessionStats.turns` and let go of it again. |
| src/client/index.js | 5158 | cancelPeeks | Drop every queued and in-flight peek; the window closed or unloaded. |
| src/client/index.js | 5168 | relativeTime | Coarse "how long ago" for a row. Deliberately four buckets, so a list |
| src/client/index.js | 5179 | paletteHint | Footer hint, rebuilt from the live bindings and the current depth. |
| src/client/index.js | 5238 | paletteHeadline | The one line above the list: what is on the reader's plate right now. |
| src/client/index.js | 5268 | conversationPool | Every conversation worth offering, newest first. |
| src/client/index.js | 5315 | sortByRecency | Sort rows by recency, newest first, with the id as a deterministic |
| src/client/index.js | 5334 | hereIndex | Where the conversation on screen sits in a list, or 0 when it is not |
| src/client/index.js | 5360 | firstOwedIndex | Where the selection opens: the first thing waiting on the reader, else |
| src/client/index.js | 5393 | attentionOf | Which attention block a conversation belongs to, or null for the plain |
| src/client/index.js | 5437 | paletteBlocks | Split the pool into the attention blocks and the browsing blocks. |
| src/client/index.js | 5513 | waitedSince | How long a conversation has been waiting on the reader, as a stamp. |
| src/client/index.js | 5532 | revealMore | Reveal one more batch of older conversations. |
| src/client/index.js | 5577 | paletteSections | The blocks to draw, in order, each with its header. |
| src/client/index.js | 5616 | rebuildRows | Rebuild `rows` and `sections` from the two blocks. |
| src/client/index.js | 5642 | folderIndex | Which folder each conversation lives in, as `{ label, path }` keyed by |
| src/client/index.js | 5679 | folderById | One workspace, by the id the board files its goals under. |
| src/client/index.js | 5711 | workspaceForGoal | The workspace a new conversation started from one goal would join. |
| src/client/index.js | 5740 | boardBlockByKey | One goal of the last paint, by the key a card is filed under. |
| src/client/index.js | 5754 | folderLabel | What a folder reads as on a row: the Workspace's own title, else the last |
| src/client/index.js | 5786 | rowColumns | The row grid: the state chip, the name, and the metadata — tag, stage, |
| src/client/index.js | 5806 | columnOf | The grid column one cell belongs to, on this repaint. |
| src/client/index.js | 5819 | widestCell | The widest content width among one column's cells. |
| src/client/index.js | 5845 | fitColumns | Give every row the same tracks, sized to what is actually on screen. |
| src/client/index.js | 5877 | namesOwnFolder | Whether a row in this block has to name its own folder. |
| src/client/index.js | 5889 | buildRow | One list row. Clicking it switches, so the window is not keyboard-only. |
| src/client/index.js | 6073 | buildRenameInput | The name box that replaces a row's title while it is being renamed. |
| src/client/index.js | 6108 | focusRename | Put the caret in the name box, with the whole name selected the first time |
| src/client/index.js | 6132 | beginRename | Start renaming the selected conversation. |
| src/client/index.js | 6141 | cancelRename | Drop the edit and repaint the row as it was. |
| src/client/index.js | 6155 | commitRename | Hand the typed name to the host. |
| src/client/index.js | 6192 | renameSession | Rename one conversation, the way the shell's own sidebar does it: retain |
| src/client/index.js | 6242 | archiveSession | Archive the selected conversation, through the host's own action. |
| src/client/index.js | 6282 | archiveFailureText | A reason from whatever the host rejected an archive with. |
| src/client/index.js | 6303 | archiveSelected | Archive the selected row, with the footer saying what happened. |
| src/client/index.js | 6324 | failureText | A short reason from whatever the host rejected with: a remote failure |
| src/client/index.js | 6336 | setPaletteNotice | Say something in the footer. The next repaint restores the hint, so a |
| src/client/index.js | 6351 | resetPaintScratch | Put this repaint's measurements away, ready for the next one. |
| src/client/index.js | 6367 | renderPalette | Repaint the list from `PALETTE.sections`; cheap enough at this size. |
| src/client/index.js | 6438 | moreReachable | Whether the "More" seat has anything left to give. |
| src/client/index.js | 6455 | buildSectionHeader | One block heading. It is not selectable and not a row: it names the block |
| src/client/index.js | 6499 | scrollSelectionIntoView | Keep the cursor visible when the list is longer than the panel. |
| src/client/index.js | 6513 | moreHeadingNode | The "More" heading element currently on screen, or null. |
| src/client/index.js | 6539 | refreshPalette | Re-read both feeds, holding the selection on the same conversation and |
| src/client/index.js | 6585 | selectedRow | The conversation under the cursor, or null when the cursor is standing on |
| src/client/index.js | 6601 | moreSeatAt | Where the "More" seat stands in the row order, as a row index. |
| src/client/index.js | 6624 | moveSelection | Move the selection, wrapping at both ends. |
| src/client/index.js | 6668 | activateSelection | Act on whatever the selection is standing on. |
| src/client/index.js | 6680 | openPalette | Mount the window and read the feed. Rolling state is torn down first: |
| src/client/index.js | 6792 | closePalette | Unmount the window and drop every feed subscription. |
| src/client/index.js | 6852 | paletteKeyDown | Route one keystroke to the open window. |
| src/client/index.js | 6976 | composerRoot | The message box: the rich-text editor root the shell puts the caret into. |
| src/client/index.js | 6993 | rememberComposer | Remember the element a focus landed on. It is the fallback for a host |
| src/client/index.js | 7010 | isComposerEditor | True when an element is a rich-text editor, i.e. the message box — and |
| src/client/index.js | 7026 | noteFocusRequest | Mark that the user just asked for the keyboard themselves, so the focus |
| src/client/index.js | 7045 | clearFocusRequest | Drop a request the user has just superseded by doing something else. |
| src/client/index.js | 7060 | isActivating | True for a control a bare Space activates by itself. Such a control keeps |
| src/client/index.js | 7073 | focusComposer | Put the keyboard in the message box: what the focus key is for. |
| src/client/index.js | 7098 | composerIsEmpty | True when the message box holds nothing the user put there. |
| src/client/index.js | 7121 | leaveEmptyComposer | The focus key pressed again, inside the box it put the caret in: hand the |
| src/client/index.js | 7149 | inComposer | True when a keystroke was aimed at the message box. |
| src/client/index.js | 7172 | menuOpen | True while a suggestion menu is waiting to be confirmed. |
| src/client/index.js | 7201 | onSendKey | True when this keystroke is a send, and the keyboard should not stay in |
| src/client/index.js | 7230 | doubleEnterSends | True when this Enter is the second half of a double-Enter send. |
| src/client/index.js | 7260 | sendFromComposer | Send the draft by handing the host the key it already sends with. |
| src/client/index.js | 7311 | handBackAfterSend | Give the keyboard back to the page after a send, without waiting for a |
| src/client/index.js | 7342 | breakLine | Turn a bare Enter into the host's own line break. |
| src/client/index.js | 7396 | onFocusIn | Keep the message box from taking the keyboard on its own. |
| src/client/index.js | 7422 | noteFocusReturn | Widen the licence to a focus arriving right after the window got the |
| src/client/index.js | 7434 | justReturned | Whether a focus arriving now is the tail of the window coming back. |
| src/client/index.js | 7446 | onPointerDown | A press says where the keyboard should be: inside a text field it asks |
| src/client/index.js | 7471 | dismissOutsidePress | Put an open window away when the press landed beside it. |
| src/client/index.js | 7497 | pressMissesWindow | Whether a press landed outside an open window's card. |
| src/client/index.js | 7513 | activateSession | Switch the main view to one conversation. |
| src/client/index.js | 7571 | reportStoreFull | Say that the board could not be written, once. |
| src/client/index.js | 7578 | makeBoardStore | } |
| src/client/index.js | 9267 | makeHistory | The board's history: what was done, and how to put it back. |
| src/client/index.js | 9391 | makeNoteStore | The lines pinned to conversations, and the only thing that touches them. |
| src/client/index.js | 9532 | makeHistoryStore | The history's own store: one record per local day, in IndexedDB. |
| src/client/index.js | 9713 | makeJournal | The sessions a day inherited, kept where a repaint can reach them. |
| src/client/index.js | 9888 | makeCarryStore | } |
| src/client/index.js | 9983 | dayOf | The local day a moment belongs to, as `YYYY-MM-DD`. |
| src/client/index.js | 9992 | daysBetween | How many local days lie between two `YYYY-MM-DD` days. |
| src/client/index.js | 10002 | readMoment | The page the board last drew, as it was left, or null. |
| src/client/index.js | 10016 | forgetMoment | Forget the page that was left, once it has been filed. |
| src/client/index.js | 10040 | noteMoment | Remember the page this repaint draws. |
| src/client/index.js | 10064 | momentHeld | Whether the store still holds exactly the bytes this page last wrote. |
| src/client/index.js | 10083 | pageDoc | The arrangement a day's page keeps. |
| src/client/index.js | 10109 | pageView | The page as it reads, frozen. |
| src/client/index.js | 10159 | settleDay | File the page that was left, and start today. |
| src/client/index.js | 10194 | filePage | Write one page, and keep the history's size honest. |
| src/client/index.js | 10227 | settleCarry | Carry the members of the page just filed into today. |
| src/client/index.js | 10244 | pruneHistory | Keep the newest `snapshotKeepDays` pages, and no more. |
| src/client/index.js | 10262 | dropCarried | Let go of the conversations carried longest with no movement. |
| src/client/index.js | 10290 | maybeShowSeal | Show the day that just ended, once, the first time the board is up after it. |
| src/client/index.js | 10312 | sealCounts | The counts one day's summary reads off. |
| src/client/index.js | 10333 | sealLeft | What the desk still owes the reader, as of this press. |
| src/client/index.js | 10362 | paintSeal | Draw one day's summary. |
| src/client/index.js | 10438 | closeSeal | Take the day's summary down. |
| src/client/index.js | 10449 | historySearchRow | The one-line search above the days. |
| src/client/index.js | 10482 | searchHistory | Find a sentence across the pages, newest first. |
| src/client/index.js | 10524 | historyMatches | The lines of one page that carry the needle: its cards, its notes, its names. |
| src/client/index.js | 10552 | historyHitRow | One page a search found, with the lines it was found by. |
| src/client/index.js | 10590 | openBoardHistory | Open the history: the pages the board has been. |
| src/client/index.js | 10663 | closeBoardHistory | Take the history panel down, whichever page it was showing. |
| src/client/index.js | 10685 | renderHistory | Draw the list of days. |
| src/client/index.js | 10712 | historyNote | One quiet sentence where a page would be. |
| src/client/index.js | 10720 | historyMeta | How a page reads at a glance: what it was made of. |
| src/client/index.js | 10731 | historyDayRow | One day in the list, and its page once it is opened. |
| src/client/index.js | 10759 | historyDetail | One day's page, as it read: its goals, their conversations, its cards. |
| src/client/index.js | 10885 | restoreDay | Copy one page into today. |
| src/client/index.js | 10910 | applyPageOrder | Put the page's own arrangement back onto the panels. |
| src/client/index.js | 10928 | settleRestoredCarry | Seat a restored page's members as today's carried set. |
| src/client/index.js | 10942 | keepBackup | Keep what a restore or an import is about to replace. |
| src/client/index.js | 10955 | takeBeforeBackup | Take back what the last restore or import replaced. |
| src/client/index.js | 10973 | downloadJson | Hand a file to the browser. |
| src/client/index.js | 11007 | exportHistory | Write the board, its notes and every page into one file. |
| src/client/index.js | 11038 | pickHistoryFile | Ask for one file, and take it in when it arrives. |
| src/client/index.js | 11073 | importHistory | Take in one exported file. |
| src/client/index.js | 11118 | toggleBoard | The board the plugin opens when a page is not available. |
| src/client/index.js | 11131 | showBoard | } |
| src/client/index.js | 11155 | showOverview | Open the overview page: the board's own button, and the sidebar's row. |
| src/client/index.js | 11179 | pointInSelection | Whether one right press landed inside the words the reader selected. |
| src/client/index.js | 11220 | onContextMenu | The way back from a conversation: a right press on its page. |
| src/client/index.js | 11240 | beginBoardNote | Start typing the line on one card. |
| src/client/index.js | 11253 | commitBoardNote | Keep what the open field says, and close it. |
| src/client/index.js | 11268 | cancelBoardNote | Throw the open field away, leaving the card as it was. |
| src/client/index.js | 11284 | openNote | The note key: open the board on the conversation on screen, with its |
| src/client/index.js | 11321 | pinToBoard | Put one conversation on the board by hand. |
| src/client/index.js | 11347 | startOfToday | Midnight today, in the reader's own zone. |
| src/client/index.js | 11381 | goalByKey | The canvas as it is drawn: one block per workspace in play, the |
| src/client/index.js | 11407 | nextGoalName | The name a goal cut from a card starts with: the one it came from, plus |
| src/client/index.js | 11428 | cardVerdictOf | What the reader has said about a conversation, if it still applies. |
| src/client/index.js | 11446 | noteCardFinished | Write down that a turn ended, before the shell forgets it did. |
| src/client/index.js | 11466 | goalOfRow | Which goal one conversation is drawn in. |
| src/client/index.js | 11477 | boardBlocks | } |
| src/client/index.js | 11676 | rememberFork | Record a fork this plugin watched, and repaint a board that is up. |
| src/client/index.js | 11700 | inheritForkHome | File a branch in the goal its parent is in. |
| src/client/index.js | 11723 | revealBoardCard | Bring one card into view, without moving the paper any further than it |
| src/client/index.js | 11746 | watchForks | Watch the sessions service for forks, so a branch made anywhere in the |
| src/client/index.js | 11786 | boardPlaces | The places the blocks will be drawn at. |
| src/client/index.js | 11816 | firstFreeSlot | The first place on the paper no block already stands on. |
| src/client/index.js | 11848 | slotTaken | Whether a block already stands on a place. |
| src/client/index.js | 11874 | boardPanelHeights | How tall each painted panel stands, keyed by the block it is. |
| src/client/index.js | 11895 | boardPanelWidths | How wide each painted panel stands, keyed by the block it is. |
| src/client/index.js | 11921 | boardExtent | How big the stage has to be to hold everything on it. |
| src/client/index.js | 11949 | applyBoardZoom | Put the canvas's magnification on the paper. |
| src/client/index.js | 11972 | setBoardZoom | Zoom the canvas, keeping one point of it where it is on screen. |
| src/client/index.js | 12004 | fitBoardToWindow | Scale the canvas so the whole of it stands inside the window. |
| src/client/index.js | 12034 | onBoardResize | A window that changed size re-fits a canvas that was fitted to it. |
| src/client/index.js | 12044 | onBoardWheel | Ctrl/Cmd + wheel zooms the canvas, the way every canvas does. |
| src/client/index.js | 12064 | nextCardPlace | Where a new loose card goes when the reader did not point at a place. |
| src/client/index.js | 12095 | boardFreePlace | A place on the paper for a goal that was just asked for, near the eye. |
| src/client/index.js | 12138 | addBoardGoal | Stand a new goal on the canvas, ready to be given a purpose. |
| src/client/index.js | 12160 | closeNewSessionSheet | Take the new-conversation sheet down, and forget what it was writing. |
| src/client/index.js | 12185 | paintNewSessionBusy | Put the sheet's confirm button in step with the one host round trip. |
| src/client/index.js | 12201 | paintNewSessionModel | Say which model the sheet would start the conversation on. |
| src/client/index.js | 12225 | paintNewSessionField | Paint one of the sheet's fields as focused or not. |
| src/client/index.js | 12236 | watchNewSessionField | Let a field say where the caret is, for as long as it lives. |
| src/client/index.js | 12251 | openNewSessionSheet | Show the sheet that asks for a conversation's name and the words it opens with. |
| src/client/index.js | 12460 | commitNewSessionSheet | Read the sheet and start the conversation it describes. |
| src/client/index.js | 12494 | applyNewSessionModel | Put the model the sheet was set to onto the conversation just made. |
| src/client/index.js | 12536 | startNewSessionForGoal | Start one conversation under one goal, with the reader's words. |
| src/client/index.js | 12638 | tidyPanels | The panels as a tidy sees them: a rectangle of paper, the conversations |
| src/client/index.js | 12709 | tidyHomeOf | Which panel a card belongs beside, if any. |
| src/client/index.js | 12734 | tidyColumnX | The first x at or right of `x` that no panel already stands in. |
| src/client/index.js | 12752 | tidyBySession | The order cards stand in beside their panel: the panel's own order. |
| src/client/index.js | 12758 | tidyByTray | The order the inbox tray keeps: what is finished sinks to the bottom. |
| src/client/index.js | 12778 | tidyGroup | Lay one group of cards out as a column beside its panel. |
| src/client/index.js | 12839 | tidyPlan | Where the thoughts still on the paper stand, as a list of places. |
| src/client/index.js | 12880 | tidyPanelOrder | The order a tidy packs panels in: left to right, top to bottom, tray last. |
| src/client/index.js | 12902 | tidyRowWidth | How wide one row of a tidy may be, in unzoomed pixels. |
| src/client/index.js | 12927 | tidyPlaces | Where every panel stands after a tidy. |
| src/client/index.js | 12969 | tidyBoard | Tidy the canvas: put the thoughts where they belong, then lay the panels |
| src/client/index.js | 13049 | tidyLooseCards | Put the thoughts that are still on the paper clear of the panels. |
| src/client/index.js | 13101 | glideTidyPanels | Slide one tidy's panels to their new places, then put the cards around |
| src/client/index.js | 13155 | glideTidyBatch | Fly one tidy's cards to their places, a beat apart. |
| src/client/index.js | 13213 | openBoard | Mount the board. |
| src/client/index.js | 13262 | mountBoardInto | Build the board's parts into a root element, whichever mount owns it. |
| src/client/index.js | 13573 | unmountBoard | Unmount the board, whichever mount holds it. |
| src/client/index.js | 13679 | closeBoard | Take the floating board down, element and all. |
| src/client/index.js | 13706 | boardFieldOpen | Repaint the whole canvas from the feeds. |
| src/client/index.js | 13732 | renderBoard | } |
| src/client/index.js | 13955 | boardStatusFingerprint | The board's reading of every card's status, as one string. |
| src/client/index.js | 13976 | renderBoardOnStatus | Repaint the board for a status tick, but only if something on screen |
| src/client/index.js | 13991 | tickBoardClocks | Move the running cards' minute hands, in place. |
| src/client/index.js | 14014 | startDayTimer | Arm the one timer that watches for midnight. |
| src/client/index.js | 14029 | stopDayTimer | Stop the midnight timer: the board closed, or the page went away. |
| src/client/index.js | 14036 | startBoardClock | Start the tick that keeps the board's clocks honest. |
| src/client/index.js | 14047 | stopBoardClock | Stop the tick: the board closed, or nothing on it is running. |
| src/client/index.js | 14069 | paintHistory | Paint the "only what is marked" toggle to match the state it stands for. |
| src/client/index.js | 14084 | paintBoardStarFilter | } |
| src/client/index.js | 14101 | slotHue | One workspace on the canvas: a heading that can be dragged, and the |
| src/client/index.js | 14114 | slotSeed | Which seat a block starts on: its own id, never its name. |
| src/client/index.js | 14131 | boardSlots | Give every panel on this paint its own slice of the wheel. |
| src/client/index.js | 14166 | blockSeat | The seat one block wears: the one written down, else the one this paint gave it. |
| src/client/index.js | 14186 | goalHue | The hue one place is washed with, or null for the tray. |
| src/client/index.js | 14192 | blockInk | The colour one panel's own mark wears. |
| src/client/index.js | 14209 | noteHue | The paper one note is written on. |
| src/client/index.js | 14213 | notePaper | } |
| src/client/index.js | 14240 | noteInkOf | The ink one note is drawn in. |
| src/client/index.js | 14350 | boardIcon | One of those glyphs, at a size, as an element. |
| src/client/index.js | 14407 | boardNoteCols | How many rows an idea card's field needs for what it holds. |
| src/client/index.js | 14413 | boardTextRows | } |
| src/client/index.js | 14438 | boardEditorRows | The lines a card's field opens on. |
| src/client/index.js | 14466 | boardNoteMetrics | How much paper one idea card takes. |
| src/client/index.js | 14500 | noteParts | How much paper one idea card takes: its heading, and the lines it holds. |
| src/client/index.js | 14520 | boardCardBox | How much paper one idea card takes at rest. |
| src/client/index.js | 14546 | boardCardOpenBox | The paper a note takes while its field is up: all of its body, up to the cap. |
| src/client/index.js | 14568 | canvasPointOf | Where a point on the screen falls on the paper. |
| src/client/index.js | 14590 | raiseBoardCard | Bring one card to the front of the paper. |
| src/client/index.js | 14610 | beginNoteLift | Lift one put-away note out of the tray, under the hand. |
| src/client/index.js | 14660 | markDropGoal | Say which goal would take the card if the hand let go of it here. |
| src/client/index.js | 14679 | markDoneDrop | Light the finished strip a carried conversation would land in. |
| src/client/index.js | 14692 | boardHomeOf | The goal one conversation is drawn in on this paint, or null. |
| src/client/index.js | 14707 | boardRowOf | One conversation of this paint, by id. |
| src/client/index.js | 14723 | sendToDone | Put one conversation in the finished strip, word and all. |
| src/client/index.js | 14740 | bringBackFromDone | Take one conversation back out of the finished strip, word and all. |
| src/client/index.js | 14759 | markNoDrop | Say, under the hand, that the paper will not take this card. |
| src/client/index.js | 14785 | dropNoDropTip | Take the "the paper will not take it" line off the page. |
| src/client/index.js | 14804 | goalNodeAt | The goal panel under a native drag, asked in the order a browser answers. |
| src/client/index.js | 14816 | nearestGoal | The goal panel an element stands in, or null when it stands in none. |
| src/client/index.js | 14832 | goalUnder | The goal the pointer is standing in, as the id a card is filed under. |
| src/client/index.js | 14850 | doneBarUnder | The finished strip under the hand, or null. |
| src/client/index.js | 14879 | goalHeadKeyUnder | The goal whose heading an element stands in, as the key a card starts a |
| src/client/index.js | 14904 | boardDragHasText | Whether a native drag carries words, the one thing the shell's rows set. |
| src/client/index.js | 14942 | sessionInPayload | The words a native drag is carrying, read where the browser allows it. |
| src/client/index.js | 14969 | boardDragText | } |
| src/client/index.js | 14987 | clearBoardDragGoal | Take the goal highlight a native drag drew off the paper. |
| src/client/index.js | 15004 | onNativeDragEnd | A native drag is over, however it ended. |
| src/client/index.js | 15018 | onBoardDragOver | Say, while a native drag is over the canvas, which goal would take it. |
| src/client/index.js | 15034 | onBoardDragLeave | The native drag left the canvas: take the goal highlight with it. |
| src/client/index.js | 15054 | onBoardDrop | A conversation let go on the canvas, carried in from the host's sidebar. |
| src/client/index.js | 15081 | dropSessionOntoBoard | Take one conversation the reader dragged in, and keep it. |
| src/client/index.js | 15106 | buildSeatMenu | The twelve colours a goal can wear. |
| src/client/index.js | 15139 | pickSeat | One colour, as a press. |
| src/client/index.js | 15164 | buildGoalMenu | The verbs on a goal that are not worth a seat of their own. |
| src/client/index.js | 15187 | goalMenuItem | One line of that menu. |
| src/client/index.js | 15218 | placeGoalMenu | Stand a goal's menu under its ⋯, inside the panel's right edge. |
| src/client/index.js | 15223 | buildBoardBlock | } |
| src/client/index.js | 15634 | trayCaption | The conversations of one block, cut into threads. |
| src/client/index.js | 15649 | trayQuiet | A quiet line where a section has nothing in it yet. |
| src/client/index.js | 15667 | buildTrayNote | One note, as a line of the tray. |
| src/client/index.js | 15815 | trayInk | Ink every conversation inside one node with the tray's paper. |
| src/client/index.js | 15827 | doneBinCards | Every note put away in the finished-cards bin, newest first. |
| src/client/index.js | 15832 | doneBinCardsOf | The put-away notes one conversation was handed, newest first. |
| src/client/index.js | 15851 | openDoneBinFor | Open the bin on one conversation's own put-aways. |
| src/client/index.js | 15866 | paintDoneBin | Say how many cards the bin holds, and what it is doing. |
| src/client/index.js | 15881 | toggleDoneBin | Open or close the finished-cards list. |
| src/client/index.js | 15899 | buildDoneRow | One finished note, as a line of the card's list. |
| src/client/index.js | 15986 | mountDoneBin | Put the finished-cards list on the board, or take it away. |
| src/client/index.js | 16074 | ejectFromDoneBin | Put one card back on the paper, out of the finished-cards bin. |
| src/client/index.js | 16093 | buildInboxBody | The tray's body: the conversations nothing accounts for, and the notes put away here. |
| src/client/index.js | 16138 | boardBlockColumns | How many columns a panel reads across. |
| src/client/index.js | 16154 | boardCardStacked | Whether one card is drawn inside a conversation's column. |
| src/client/index.js | 16177 | boardBlockWidth | How wide a panel stands. |
| src/client/index.js | 16201 | buildBoardColumns | A goal's conversations, laid out across the panel. |
| src/client/index.js | 16243 | buildBoardColumn | One conversation of a panel, as the column it stands in. |
| src/client/index.js | 16271 | buildDoneBar | The long strip at the foot of a goal: what the reader finished today. |
| src/client/index.js | 16350 | buildQuietStrip | The conversations a panel carried in and nobody has touched, one line each. |
| src/client/index.js | 16406 | buildQuietRow | One quiet conversation, as the line it is drawn as. |
| src/client/index.js | 16478 | buildQuietStack | The thoughts under one quiet conversation, once its count was pressed. |
| src/client/index.js | 16497 | buildBoardStack | The thoughts filed under one conversation. |
| src/client/index.js | 16563 | markCardFresh | Wear the one beat a completion is worth - once. |
| src/client/index.js | 16601 | verdictText | The word one conversation wears, in the reader's language. |
| src/client/index.js | 16618 | buildVerdictChip | What the reader said about a card, as the chip that says it. |
| src/client/index.js | 16645 | buildStateAdd | The empty seat, for a card the shell has nothing to say about. |
| src/client/index.js | 16665 | stateToggle | Open or close one card's state menu. |
| src/client/index.js | 16686 | buildVerdictMenu | The two words, and the way back to having said nothing. |
| src/client/index.js | 16706 | verdictItem | One word in that menu. |
| src/client/index.js | 16739 | clearVerdictItem | The row that takes the word back. |
| src/client/index.js | 16759 | buildBoardCard | } |
| src/client/index.js | 17227 | beginBlockRename | Start typing a goal's name into its heading. |
| src/client/index.js | 17233 | commitBlockRename | Keep the name the heading says, and close the field. |
| src/client/index.js | 17245 | cancelBlockRename | Throw the typed name away, leaving the goal as it was called. |
| src/client/index.js | 17262 | goalBaseName | The last piece of a workspace path: what the workspace is called. |
| src/client/index.js | 17275 | beginGoalIntent | Start writing what a goal is for. |
| src/client/index.js | 17290 | commitGoalIntent | Keep what the open line says, and close it. |
| src/client/index.js | 17302 | cancelGoalIntent | Throw the typed line away, leaving the goal as it was. |
| src/client/index.js | 17321 | removeBoardGoal | Take one goal off the canvas, with a few seconds to bring it back. |
| src/client/index.js | 17368 | boardNameCollisions | Which drawn cards share a name, and where each one stands in its group. |
| src/client/index.js | 17394 | boardTitleOf | The name one card wears: the reader's word while the shell catches up, |
| src/client/index.js | 17410 | noteCardTitle | Put the reader's word on a card before the shell has answered. |
| src/client/index.js | 17425 | settleTitles | Let go of the stand-in names the feed has caught up with, or outlived. |
| src/client/index.js | 17444 | beginBoardRename | Start renaming one conversation from its card. |
| src/client/index.js | 17462 | commitBoardRename | Keep what the open name field says, and rename the conversation. |
| src/client/index.js | 17501 | cancelBoardRename | Throw the open name field away, leaving the conversation as it was. |
| src/client/index.js | 17520 | forkBoardCard | Start a branch from one conversation, and draw the line when it lands. |
| src/client/index.js | 17566 | returnForkMark | Let a conversation's branch mark answer again, and say so on the card. |
| src/client/index.js | 17582 | waitForBranchRow | The catalogue row for one conversation, asked for until it arrives. |
| src/client/index.js | 17614 | settleBranchName | Give a fresh branch a name nobody else is using, and answer with it. |
| src/client/index.js | 17657 | pasteIntoComposer | Put words in the message box of the conversation on screen. |
| src/client/index.js | 17691 | composerHasText | Whether the message box already holds something. |
| src/client/index.js | 17707 | boxHasText | Whether one box already holds words. |
| src/client/index.js | 17722 | seatCaretAtEnd | Put the caret at the end of the box's content. |
| src/client/index.js | 17761 | dropCardIntoComposer | Hand one loose card's words to a conversation's message box. |
| src/client/index.js | 17781 | pasteIntoBoxNow | Put the words in the box that is on screen right now, if there is one. |
| src/client/index.js | 17803 | putThroughEditor | Put text into the editor through the editing command. |
| src/client/index.js | 17822 | pasteThroughEvent | Put text into the editor as a real paste event. |
| src/client/index.js | 17848 | ideaFocusCard | One card from the board's own document, by id. |
| src/client/index.js | 17868 | ideaFocusOrigin | Where a press happened, as a point the sheet can grow out of. |
| src/client/index.js | 17893 | animateIdeaFocusIn | Let the sheet grow out of the place the reader pointed at. |
| src/client/index.js | 17936 | ideaFocusSessionTitle | The name of the conversation a thought is tied to, for the sheet's foot. |
| src/client/index.js | 17957 | paintIdeaFocusDone | Keep the sheet's done box in step with the card it belongs to. |
| src/client/index.js | 17978 | cleanIdeaTitle | Keep the title on one line while letting it wrap on the paper. |
| src/client/index.js | 17986 | growIdeaTitle | Let the title field take as many lines as the words it is showing. |
| src/client/index.js | 18005 | writeIdeaFocus | Write what the sheet says into the card it belongs to. |
| src/client/index.js | 18029 | openIdeaFocus | Open one idea card, or a blank new one, in the centre of the board. |
| src/client/index.js | 18273 | closeIdeaFocus | Close the sheet, keeping what it says. |
| src/client/index.js | 18324 | deliverIdeaFocus | Hand the sheet's thought to the conversation it is tied to. |
| src/client/index.js | 18348 | buildIdeaMenu | The menu behind a thought card's ⋯. |
| src/client/index.js | 18391 | ideaMenuItem | One line of that menu. |
| src/client/index.js | 18420 | buildSessionMenu | The verbs on a conversation card that are not worth a seat of their own. |
| src/client/index.js | 18461 | placeCardMenu | One line of that menu. |
| src/client/index.js | 18478 | cardMenuItem | } |
| src/client/index.js | 18517 | buildBoardLooseCard | One loose card: a thought the reader put on the canvas rather than in a |
| src/client/index.js | 18868 | boardJoinText | Join a card's two parts back into the one string the store keeps. |
| src/client/index.js | 18887 | beginBoardCard | Start typing into one loose card - at its title, or at its body. |
| src/client/index.js | 18927 | boardTakeCardText | Keep what the open field says, and close it. |
| src/client/index.js | 18944 | commitBoardCard | } |
| src/client/index.js | 18957 | cancelBoardCard | Throw the open field away, leaving the card as it was last written. |
| src/client/index.js | 18978 | settleBoardCardForPress | Settle the open card field for a press, without the paint a settle |
| src/client/index.js | 19001 | addBoardCardAt | Open a new thought at a place, and let the sheet write it. |
| src/client/index.js | 19018 | addBoardCard | Open a new thought where the reader is looking, or below everything when |
| src/client/index.js | 19035 | removeLooseCard | Take one loose card off the canvas. |
| src/client/index.js | 19080 | removeBoardCard | Take one conversation off the board. |
| src/client/index.js | 19122 | handleOf | A press on a block's heading: the handle the panel is dragged by. |
| src/client/index.js | 19151 | beginStackedCarrier | Lift one card out of a conversation's column, where the hand is. |
| src/client/index.js | 19190 | stackCardBefore | The card a drop should sit above, from where the pointer let go. |
| src/client/index.js | 19218 | closeIdeaMenu | Mark the column the hand is over, or clear every mark. |
| src/client/index.js | 19235 | closeSeatMenu | Put the colour wheel away, without a repaint. |
| src/client/index.js | 19255 | closeGoalMenu | Put a goal's ⋯ menu away, without a repaint. |
| src/client/index.js | 19275 | closeVerdictMenu | Put a card's state menu away, without a repaint. |
| src/client/index.js | 19294 | closeSessionMenu | Put a conversation card's menu away, without a repaint. |
| src/client/index.js | 19310 | paintStackDrop | } |
| src/client/index.js | 19328 | paintHeadDrop | Light the heading of the goal a carried card would start a conversation in. |
| src/client/index.js | 19347 | parkCardOutside | Give a card lifted out of a column a place on the paper. |
| src/client/index.js | 19374 | boardPointerDown | The one press handler on the canvas. |
| src/client/index.js | 19526 | boardNoteDone | Put the drop bands on screen, or take them away. |
| src/client/index.js | 19534 | showDropZones | } |
| src/client/index.js | 19549 | boardListen | Start listening for the rest of a gesture, once it has been armed. |
| src/client/index.js | 19566 | beginSessionGrab | Start a session drag: a sort inside its own panel, a carry outside it. |
| src/client/index.js | 19584 | panelHolds | Whether a hand is still close enough to its panel to be sorting inside it. |
| src/client/index.js | 19602 | beginSessionReorder | Sort one conversation among its neighbours, where the hand is. |
| src/client/index.js | 19661 | paintSessionReorder | Follow the hand, and let the other columns make room as it passes them. |
| src/client/index.js | 19699 | sessionSlotAt | The place the hand is asking for, read off the grid. |
| src/client/index.js | 19745 | leaveSessionReorder | Hand the drag back to the carrier, because the pointer left the panel. |
| src/client/index.js | 19758 | resetSessionReorder | Put every column back where the paint left it. |
| src/client/index.js | 19784 | commitSessionReorder | Write the order the hand chose, once, and draw it. |
| src/client/index.js | 19822 | beginSessionCarrier | Give a carried card its body, where the hand is. |
| src/client/index.js | 19864 | onBoardMove | Follow the pointer: pan the paper, or carry what the hand picked up. |
| src/client/index.js | 19985 | onBoardUp | Let go: write down what the gesture decided, unless it never moved. |
| src/client/index.js | 20263 | handCardToSession | Hand one loose card's words to a conversation, and leave a trace behind. |
| src/client/index.js | 20289 | nameSessionForCard | Let the conversation a card was handed to wear the card's own name. |
| src/client/index.js | 20319 | drawCardLinks | Draw the elbow from every branch back to the conversation it was cut from. |
| src/client/index.js | 20375 | cancelBoardDrag | Drop the gesture and put back what it was carrying. |
| src/client/index.js | 20385 | endBoardDrag | Take the gesture's furniture off the page and forget it. |
| src/client/index.js | 20431 | onBoardBlurDrag | The window losing focus mid-gesture: the pointer left with it. |
| src/client/index.js | 20446 | onBoardDoubleClick | A double click on the paper: write a card right there. |
| src/client/index.js | 20495 | makeNotice | The transient line the plugin speaks in. |
| src/client/index.js | 20718 | showToast | Say one thing for a moment. A second press replaces the line and restarts |
| src/client/index.js | 20723 | hideToast | Take the notice down and drop the pending timer. |
| src/client/index.js | 20737 | SendHintLine | The line that names the send key, contributed to the shell's own dock row |
| src/client/index.js | 20769 | sendKeyLabel | The modifier this machine's send accelerator lives on, named the way the |
| src/client/index.js | 20788 | modelDirectories | The host's session model-selection service, when it publishes one. |
| src/client/index.js | 20804 | effortLevels | The reasoning levels one model offers, in the order the composer's own |
| src/client/index.js | 20828 | levelIndex | Where one level sits in the list. An explicit selection wins; without one |
| src/client/index.js | 20849 | currentLevelId | The level in effect for one selection, read the way the composer's own |
| src/client/index.js | 20860 | isCurrentEntry | Whether one entry is the model the conversation is already on. |
| src/client/index.js | 20878 | rowMarkedLevel | The level one picker row shows as marked, which is the level it would end |
| src/client/index.js | 20898 | rowSubmitLevel | The level one picker row would submit if it were confirmed without the |
| src/client/index.js | 20911 | refusal | A refusal this plugin can explain on its own, so the notice carries |
| src/client/index.js | 20930 | cycleEffort | One press of the reasoning key: step the visible conversation's level one |
| src/client/index.js | 20964 | stepEffort | Read the levels off one session directory and submit the next one. |
| src/client/index.js | 21014 | catalogGroups | Every provider/model the host currently advertises, for the settings page. |
| src/client/index.js | 21052 | groupsOf | The provider groups out of one loaded catalog or directory snapshot. Both |
| src/client/index.js | 21070 | offeredModels | The catalog as a lookup, one entry per `provider/model`. |
| src/client/index.js | 21108 | modelEntries | The configured models the directory currently offers, in the order the |
| src/client/index.js | 21120 | modelIndex | Where one model sits in the list; -1 when it is not one of them. |
| src/client/index.js | 21137 | modelDirectoryOfCurrent | Resolve the model directory behind the conversation on screen. |
| src/client/index.js | 21168 | readModelList | Read the list off one session directory. |
| src/client/index.js | 21212 | readNewSessionModelList | The list the sheet's model row offers. |
| src/client/index.js | 21235 | openNewSessionModelPick | Open the model window for the sheet's model row. |
| src/client/index.js | 21275 | openModelPick | One press of the model key: open the picker on the list of models the |
| src/client/index.js | 21487 | modelPickHint | The line under the picker: what it is showing, and what the keys do. |
| src/client/index.js | 21516 | renderModelPick | Repaint the picker's rows and footer from `MODELPICK.entries`. |
| src/client/index.js | 21539 | markedLevel | The level one row is currently marked with. |
| src/client/index.js | 21554 | confirmLevel | The level one confirm would submit. |
| src/client/index.js | 21577 | buildModelRow | One row of the picker: the model's name with the `current` tag in front of |
| src/client/index.js | 21632 | buildLevelCell | The levels of one model. |
| src/client/index.js | 21685 | levelClickHandler | The press handler for one level chip. |
| src/client/index.js | 21699 | keepModelPickVisible | Keep the selected row in sight when the list is longer than the card. |
| src/client/index.js | 21721 | openModelWindow | Mount the picker, with the selection already on the model in effect. |
| src/client/index.js | 21787 | closeModelPick | Unmount the picker and forget everything it was showing. |
| src/client/index.js | 21823 | moveModelPick | Move the picker's selection, wrapping at both ends. |
| src/client/index.js | 21851 | moveModelPickEntry | Put the selected model somewhere else in the list, and remember it there. |
| src/client/index.js | 21891 | reorderFavorites | Put an ordered list of pairs back into the configured one, in the new |
| src/client/index.js | 21919 | stepModelPickLevel | Step the level of the selected row, wrapping at both ends. |
| src/client/index.js | 21948 | confirmModelPick | Confirm the selected row: submit its model at its marked level, then take |
| src/client/index.js | 22013 | modelToast | The one-line notice after a switch, naming the level when the row has one. |
| src/client/index.js | 22025 | levelName | The readable name of one level of one model, or null when there is none. |
| src/client/index.js | 22047 | modelPickKeyDown | Route one keystroke to the open picker. |
| src/client/index.js | 22125 | switchModel | Read the catalog off one session directory and submit the model and level |
| src/client/index.js | 22226 | makeTranslator | Translate through the locale seat when it is wired, else through the |
| src/client/index.js | 22242 | KeyRow | One rebindable key: focus the box, press the key you want. |
| src/client/index.js | 22282 | SliderRow | One numeric preference. |
| src/client/index.js | 22312 | ChoiceRow | A short set of mutually exclusive options, as a row of toggles. Used for |
| src/client/index.js | 22358 | ModelListGroup | The switchable models as one settings group: what is chosen, in the order |
| src/client/index.js | 22551 | VimSection | The whole Settings → Vim scrolling page. |
| src/client/index.js | 22791 | BoardPage | The board as the main panel's page. |
| src/client/index.js | 22826 | BoardPanelIcon | The sidebar entry's glyph: three columns, which is what the board is. |
| src/client/index.js | 22871 | installBoardPage | Contribute the board as a sidebar entry and a main panel. |
| src/client/index.js | 22935 | overviewToday | What today did, as the overview reads it. |
| src/client/index.js | 23028 | overviewFigure | One figure: the number, and what it counts, read as one block. |
| src/client/index.js | 23046 | overviewNumber | One number in the table: how it reads depends on what it counts. |
| src/client/index.js | 23055 | overviewHeading | One heading of the table, in the same columns as its rows. |
| src/client/index.js | 23073 | mountOverviewInto | Build the overview into an element the host owns. |
| src/client/index.js | 23205 | OverviewPage | The overview as the main panel's page. |
| src/client/index.js | 23241 | OverviewPanelIcon | The sidebar entry's glyph: three bars of a day, rising to the right. |
| src/client/index.js | 23287 | installOverviewPage | Contribute the overview as a page of its own, beside the board. |
| src/client/index.js | 23344 | installWindowCSS | The rules every window this plugin mounts shares, once. |
| src/client/index.js | 23388 | installBoardCSS | Put the board's hover and motion rules on the page, once. |
| src/client/index.js | 23564 | installSettings | Contribute the settings page and its vocabulary. Both contributions are |
| src/client/index.js | 23640 | makeApi | Debug and tuning surface, also used by tools/selftest.mjs. |
| src/client/index.js | 23986 | apply | Client activation. |
| src/client/preferences.js | 23 | defaults | Shipped defaults as a fresh object, derived from DEFAULTS so a new |
| src/client/preferences.js | 33 | copy | Current preferences as a fresh object. |
| src/client/preferences.js | 57 | isBindableKey | A single printable character, or one of `NAMED_KEYS`, is the only thing |
| src/client/preferences.js | 73 | normalizeKey | Normalise a bound key to its stored form: lower case for characters, |
| src/client/preferences.js | 89 | keyLabel | How a bound key reads in the settings box. A space is invisible in a box |
| src/client/preferences.js | 96 | clampNumber | Clamp a numeric preference to its accepted range. |
| src/client/preferences.js | 112 | sanitizeFavorites | The switchable models as a fresh list of `{provider, model}` pairs. |
| src/client/preferences.js | 131 | persist | Persist the current preferences; storage failures are not fatal. |
| src/client/preferences.js | 157 | announce | Notify the settings page that preferences changed. |
| src/client/preferences.js | 172 | applyPatch | Validate and apply one patch. Rejected patches leave preferences intact. |
| src/client/preferences.js | 245 | firstFree | The preferred key when it is free, else the first free letter. |
| src/client/preferences.js | 265 | repairKeys | Force each key group to be conflict-free. Groups are repaired back to |
| src/client/preferences.js | 329 | migrateArchiveSeat | Move the archive seat into place for a store written before it existed. |
| src/client/preferences.js | 345 | load | Read stored preferences over the defaults. |
| src/client/preferences.js | 390 | subscribe | Subscribe to preference changes. |
| src/client/scroll.js | 42 | pickScroller | Choose the container to scroll. Deterministic order: whatever sits under |
| src/client/scroll.js | 66 | canMove | Whether the container still has room in the requested direction. |
| src/client/scroll.js | 78 | resolveTarget | Walk from the picked container up to the first one that can move. This is |
| src/client/scroll.js | 88 | reducedMotion | Honour the OS "reduce motion" preference. |
| src/client/scroll.js | 98 | suppressSmooth | Pin `scroll-behavior: auto` for the animated element. Without this, a |
| src/client/scroll.js | 107 | stopAnim | Stop the animation loop and restore anything it changed. |
| src/client/scroll.js | 124 | frame | One animation frame: ease `current` toward `target`, frame-rate |
| src/client/scroll.js | 150 | push | Queue a scroll step. Resolves (or reuses) the container, extends the |
| src/client/scroll.js | 177 | stopHold | Cancel the held-key auto-repeat. |
| src/client/scroll.js | 189 | tickHold | Auto-repeat tick: one more step, then schedule the next sooner. |
| src/client/scroll.js | 210 | startHold | Start a hold: one immediate step, then our own accelerating repeat. The |
| src/client/scroll.js | 227 | directionOf | Which direction a pressed key drives, if any. |
| src/client/strings.js | 775 | localeIsZh | Best-effort locale guess, used for the nav label and fallback strings. |
| src/client/strings.js | 781 | paletteText | Built-in string for the task window; it is plugin chrome, not shell copy. |
