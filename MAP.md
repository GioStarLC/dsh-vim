# MAP - lib/client.js

由 `npm run map` 生成，不要手改。找一个功能的入口：先在这里按名字查到行号，再读那一段。

lib/client.js：26132 行，513 个顶层函数。

| 行 | 函数 | 上方注释 |
|---:|---|---|
| 1415 | localeIsZh | Best-effort locale guess, used for the nav label and fallback strings. |
| 1439 | defaults | Shipped defaults as a fresh object, derived from DEFAULTS so a new |
| 1449 | copy | Current preferences as a fresh object. |
| 1473 | isBindableKey | A single printable character, or one of `NAMED_KEYS`, is the only thing |
| 1489 | normalizeKey | Normalise a bound key to its stored form: lower case for characters, |
| 1505 | keyLabel | How a bound key reads in the settings box. A space is invisible in a box |
| 1512 | clampNumber | Clamp a numeric preference to its accepted range. |
| 1528 | sanitizeFavorites | The switchable models as a fresh list of `{provider, model}` pairs. |
| 1547 | persist | Persist the current preferences; storage failures are not fatal. |
| 1556 | announce | Notify the settings page that preferences changed. |
| 1571 | applyPatch | Validate and apply one patch. Rejected patches leave preferences intact. |
| 1645 | firstFree | The preferred key when it is free, else the first free letter. |
| 1665 | repairKeys | Force each key group to be conflict-free. Groups are repaired back to |
| 1729 | migrateArchiveSeat | Move the archive seat into place for a store written before it existed. |
| 1745 | load | Read stored preferences over the defaults. |
| 1798 | setStage | Mark one conversation, or take the mark off it, and repaint. |
| 1815 | stageHandler | The press handler for one stage word on one row. |
| 1832 | cyclePhase | Advance one conversation to the next stage, and repaint the window. |
| 1843 | subscribe | Subscribe to preference changes. |
| 1880 | isEditable | True when the element consumes printable characters itself. |
| 1894 | isScrollable | True when the element is a non-editable box that overflows vertically and |
| 1907 | parentOf | Parent element, crossing shadow boundaries through the host node. |
| 1918 | scrollerFrom | Nearest scrollable ancestor, inclusive. |
| 1928 | largestScroller | Largest visible scroll container; the last-resort target. |
| 1951 | elementAt | The topmost element at a point, when the document can be asked. A host |
| 1972 | pickScroller | Choose the container to scroll. Deterministic order: whatever sits under |
| 1996 | canMove | Whether the container still has room in the requested direction. |
| 2008 | resolveTarget | Walk from the picked container up to the first one that can move. This is |
| 2018 | reducedMotion | Honour the OS "reduce motion" preference. |
| 2028 | suppressSmooth | Pin `scroll-behavior: auto` for the animated element. Without this, a |
| 2037 | stopAnim | Stop the animation loop and restore anything it changed. |
| 2054 | frame | One animation frame: ease `current` toward `target`, frame-rate |
| 2080 | push | Queue a scroll step. Resolves (or reuses) the container, extends the |
| 2107 | stopHold | Cancel the held-key auto-repeat. |
| 2119 | tickHold | Auto-repeat tick: one more step, then schedule the next sooner. |
| 2140 | startHold | Start a hold: one immediate step, then our own accelerating repeat. The |
| 2157 | directionOf | Which direction a pressed key drives, if any. |
| 2172 | onKeyDown | Capture-phase key handler. Runs before the app's own handlers so the |
| 2582 | onKeyUp | Any keyup ends the hold, so a dropped keyup cannot leave the view scrolling. |
| 2608 | onEscapeBlur | Escape leaves a focused composer, so the scroll keys come back. |
| 2633 | onPointerMove | Remember where the pointer is. |
| 2654 | forgetPointer | Forget the remembered pointer, so the focus and centre rules decide again. |
| 2659 | onUserScroll | The user took over with the wheel or a touch: abandon our animation. |
| 2678 | onFocusLoss | Losing the window or the tab must not leave a hold or a stale pointer |
| 3149 | makeTurnPeek | The ledger behind `TURNS`, and the only thing that touches it. |
| 3273 | makePhaseLedger | The ledger behind `PHASES_MODEL`, and the only thing that touches the |
| 3388 | makeRunLedger | The ledger behind `RUNS`, and the only thing that touches it. |
| 6216 | applyBoardPageInk | Paint the page with the host's theme. |
| 6268 | sizePanel | Fit the panel to the configured size. |
| 6281 | placementMargin | How far the panel is held off the edge it is parked against. |
| 6293 | placePanel | Park the panel according to the configured position. The one place that |
| 6321 | serviceOf | One host service, however this context publishes it. These two are read |
| 6340 | taskServices | The session feed, the workspace registry, and the workspace navigator. |
| 6369 | statusFor | The shell's unified status entry for one conversation, if it publishes one. |
| 6386 | currentSession | The conversation on screen, as the shell's own shortcuts see it: the one |
| 6406 | currentSessionRunning | True when the conversation on screen has a turn in flight. |
| 6483 | watchEntries | Follow the conversation on screen for the life of the page, so an |
| 6510 | noteEntry | Start the arrival of one conversation, unless this one already had its |
| 6533 | cancelEntry | Drop the pending placement without touching what was already decided. |
| 6543 | stopEntries | Stop following arrivals; the next page arms its own watch. |
| 6568 | settleEntry | One frame of an arrival: wait until the page shows this conversation at |
| 6648 | entryRunning | Whether the conversation still has a turn in flight, or null while the |
| 6666 | lastInputRow | The last message a person wrote in the transcript, if one is on screen. |
| 6687 | entryScroller | The box a transcript row scrolls in: the nearest ancestor that declares |
| 6708 | anchorEntry | Put one transcript row at the top of its scrollport, within the box's |
| 6735 | settleEntryScroll | Let the shell treat the placement as a finished reading move. |
| 6757 | statusOf | What one conversation is doing right now, as a short label. |
| 6777 | turnsOf | The turn count already peeked for a conversation, or null. |
| 6787 | statusIsLive | True for the statuses that mean a turn is in flight: one that is running, |
| 6815 | noteDeliveries | Note the turn ends: a conversation this page watched run, no longer running. |
| 6841 | syncRuns | } |
| 6858 | watchRuns | Follow the status source for the life of the page, so a turn is stamped |
| 6881 | loadRunStamps | Read the stamps the previous page left behind, dropping the ones that are |
| 6889 | forgetRuns | Stop watching, and forget every stamp the watch had taken. |
| 6898 | runSince | The moment the turn in flight in one conversation was seen to start. |
| 6914 | elapsedText | How long a turn has been in flight, at minute resolution. |
| 6932 | tickClocks | Repaint the live chips, in place. |
| 6962 | clockDelay | Milliseconds until the next whole minute of the oldest clock given. |
| 6973 | startClock | Start the tick that keeps the clocks on screen honest. |
| 6984 | stopClock | Stop the tick: the window closed, or nothing on screen is running. |
| 7022 | donePulseAmount | How far into the beat `progress` (0..1) is, as a 0..1 swell. |
| 7036 | paintDonePulse | Paint the beat on every "just finished" chip on screen. |
| 7052 | tickDonePulse | One frame of the beat; schedules the next, or puts the chips back. |
| 7076 | startDonePulse | Start the beat, unless there is nothing to point at or the OS asked for |
| 7084 | stopDonePulse | Cancel the beat and put every chip it touched back. |
| 7102 | requestTurns | Queue a turn count for every loaded row that does not have one yet. |
| 7115 | drainPeeks | Start as many queued peeks as the concurrency budget allows. |
| 7134 | peekTurns | Read one session's `sessionStats.turns` and let go of it again. |
| 7203 | cancelPeeks | Drop every queued and in-flight peek; the window closed or unloaded. |
| 7208 | paletteText | Built-in string for the task window; it is plugin chrome, not shell copy. |
| 7219 | relativeTime | Coarse "how long ago" for a row. Deliberately four buckets, so a list |
| 7230 | paletteHint | Footer hint, rebuilt from the live bindings and the current depth. |
| 7289 | paletteHeadline | The one line above the list: what is on the reader's plate right now. |
| 7319 | conversationPool | Every conversation worth offering, newest first. |
| 7366 | sortByRecency | Sort rows by recency, newest first, with the id as a deterministic |
| 7385 | hereIndex | Where the conversation on screen sits in a list, or 0 when it is not |
| 7411 | firstOwedIndex | Where the selection opens: the first thing waiting on the reader, else |
| 7444 | attentionOf | Which attention block a conversation belongs to, or null for the plain |
| 7488 | paletteBlocks | Split the pool into the attention blocks and the browsing blocks. |
| 7564 | waitedSince | How long a conversation has been waiting on the reader, as a stamp. |
| 7583 | revealMore | Reveal one more batch of older conversations. |
| 7628 | paletteSections | The blocks to draw, in order, each with its header. |
| 7667 | rebuildRows | Rebuild `rows` and `sections` from the two blocks. |
| 7693 | folderIndex | Which folder each conversation lives in, as `{ label, path }` keyed by |
| 7730 | folderById | One workspace, by the id the board files its goals under. |
| 7762 | workspaceForGoal | The workspace a new conversation started from one goal would join. |
| 7791 | boardBlockByKey | One goal of the last paint, by the key a card is filed under. |
| 7805 | folderLabel | What a folder reads as on a row: the Workspace's own title, else the last |
| 7837 | rowColumns | The row grid: the state chip, the name, and the metadata — tag, stage, |
| 7857 | columnOf | The grid column one cell belongs to, on this repaint. |
| 7870 | widestCell | The widest content width among one column's cells. |
| 7896 | fitColumns | Give every row the same tracks, sized to what is actually on screen. |
| 7928 | namesOwnFolder | Whether a row in this block has to name its own folder. |
| 7940 | buildRow | One list row. Clicking it switches, so the window is not keyboard-only. |
| 8124 | buildRenameInput | The name box that replaces a row's title while it is being renamed. |
| 8159 | focusRename | Put the caret in the name box, with the whole name selected the first time |
| 8183 | beginRename | Start renaming the selected conversation. |
| 8192 | cancelRename | Drop the edit and repaint the row as it was. |
| 8206 | commitRename | Hand the typed name to the host. |
| 8243 | renameSession | Rename one conversation, the way the shell's own sidebar does it: retain |
| 8293 | archiveSession | Archive the selected conversation, through the host's own action. |
| 8333 | archiveFailureText | A reason from whatever the host rejected an archive with. |
| 8354 | archiveSelected | Archive the selected row, with the footer saying what happened. |
| 8375 | failureText | A short reason from whatever the host rejected with: a remote failure |
| 8387 | setPaletteNotice | Say something in the footer. The next repaint restores the hint, so a |
| 8402 | resetPaintScratch | Put this repaint's measurements away, ready for the next one. |
| 8418 | renderPalette | Repaint the list from `PALETTE.sections`; cheap enough at this size. |
| 8489 | moreReachable | Whether the "More" seat has anything left to give. |
| 8506 | buildSectionHeader | One block heading. It is not selectable and not a row: it names the block |
| 8550 | scrollSelectionIntoView | Keep the cursor visible when the list is longer than the panel. |
| 8564 | moreHeadingNode | The "More" heading element currently on screen, or null. |
| 8590 | refreshPalette | Re-read both feeds, holding the selection on the same conversation and |
| 8636 | selectedRow | The conversation under the cursor, or null when the cursor is standing on |
| 8652 | moreSeatAt | Where the "More" seat stands in the row order, as a row index. |
| 8675 | moveSelection | Move the selection, wrapping at both ends. |
| 8719 | activateSelection | Act on whatever the selection is standing on. |
| 8731 | openPalette | Mount the window and read the feed. Rolling state is torn down first: |
| 8843 | closePalette | Unmount the window and drop every feed subscription. |
| 8903 | paletteKeyDown | Route one keystroke to the open window. |
| 9027 | composerRoot | The message box: the rich-text editor root the shell puts the caret into. |
| 9044 | rememberComposer | Remember the element a focus landed on. It is the fallback for a host |
| 9061 | isComposerEditor | True when an element is a rich-text editor, i.e. the message box — and |
| 9077 | noteFocusRequest | Mark that the user just asked for the keyboard themselves, so the focus |
| 9096 | clearFocusRequest | Drop a request the user has just superseded by doing something else. |
| 9111 | isActivating | True for a control a bare Space activates by itself. Such a control keeps |
| 9124 | focusComposer | Put the keyboard in the message box: what the focus key is for. |
| 9149 | composerIsEmpty | True when the message box holds nothing the user put there. |
| 9172 | leaveEmptyComposer | The focus key pressed again, inside the box it put the caret in: hand the |
| 9200 | inComposer | True when a keystroke was aimed at the message box. |
| 9223 | menuOpen | True while a suggestion menu is waiting to be confirmed. |
| 9252 | onSendKey | True when this keystroke is a send, and the keyboard should not stay in |
| 9281 | doubleEnterSends | True when this Enter is the second half of a double-Enter send. |
| 9311 | sendFromComposer | Send the draft by handing the host the key it already sends with. |
| 9362 | handBackAfterSend | Give the keyboard back to the page after a send, without waiting for a |
| 9393 | breakLine | Turn a bare Enter into the host's own line break. |
| 9447 | onFocusIn | Keep the message box from taking the keyboard on its own. |
| 9473 | noteFocusReturn | Widen the licence to a focus arriving right after the window got the |
| 9485 | justReturned | Whether a focus arriving now is the tail of the window coming back. |
| 9497 | onPointerDown | A press says where the keyboard should be: inside a text field it asks |
| 9522 | dismissOutsidePress | Put an open window away when the press landed beside it. |
| 9548 | pressMissesWindow | Whether a press landed outside an open window's card. |
| 9564 | activateSession | Switch the main view to one conversation. |
| 9622 | reportStoreFull | Say that the board could not be written, once. |
| 9629 | makeBoardStore | } |
| 11318 | makeHistory | The board's history: what was done, and how to put it back. |
| 11442 | makeNoteStore | The lines pinned to conversations, and the only thing that touches them. |
| 11583 | makeHistoryStore | The history's own store: one record per local day, in IndexedDB. |
| 11764 | makeJournal | The sessions a day inherited, kept where a repaint can reach them. |
| 11939 | makeCarryStore | } |
| 12034 | dayOf | The local day a moment belongs to, as `YYYY-MM-DD`. |
| 12043 | daysBetween | How many local days lie between two `YYYY-MM-DD` days. |
| 12053 | readMoment | The page the board last drew, as it was left, or null. |
| 12067 | forgetMoment | Forget the page that was left, once it has been filed. |
| 12091 | noteMoment | Remember the page this repaint draws. |
| 12115 | momentHeld | Whether the store still holds exactly the bytes this page last wrote. |
| 12134 | pageDoc | The arrangement a day's page keeps. |
| 12160 | pageView | The page as it reads, frozen. |
| 12210 | settleDay | File the page that was left, and start today. |
| 12245 | filePage | Write one page, and keep the history's size honest. |
| 12278 | settleCarry | Carry the members of the page just filed into today. |
| 12295 | pruneHistory | Keep the newest `snapshotKeepDays` pages, and no more. |
| 12313 | dropCarried | Let go of the conversations carried longest with no movement. |
| 12341 | maybeShowSeal | Show the day that just ended, once, the first time the board is up after it. |
| 12363 | sealCounts | The counts one day's summary reads off. |
| 12384 | sealLeft | What the desk still owes the reader, as of this press. |
| 12413 | paintSeal | Draw one day's summary. |
| 12489 | closeSeal | Take the day's summary down. |
| 12500 | historySearchRow | The one-line search above the days. |
| 12533 | searchHistory | Find a sentence across the pages, newest first. |
| 12575 | historyMatches | The lines of one page that carry the needle: its cards, its notes, its names. |
| 12603 | historyHitRow | One page a search found, with the lines it was found by. |
| 12641 | openBoardHistory | Open the history: the pages the board has been. |
| 12714 | closeBoardHistory | Take the history panel down, whichever page it was showing. |
| 12736 | renderHistory | Draw the list of days. |
| 12763 | historyNote | One quiet sentence where a page would be. |
| 12771 | historyMeta | How a page reads at a glance: what it was made of. |
| 12782 | historyDayRow | One day in the list, and its page once it is opened. |
| 12810 | historyDetail | One day's page, as it read: its goals, their conversations, its cards. |
| 12936 | restoreDay | Copy one page into today. |
| 12961 | applyPageOrder | Put the page's own arrangement back onto the panels. |
| 12979 | settleRestoredCarry | Seat a restored page's members as today's carried set. |
| 12993 | keepBackup | Keep what a restore or an import is about to replace. |
| 13006 | takeBeforeBackup | Take back what the last restore or import replaced. |
| 13024 | downloadJson | Hand a file to the browser. |
| 13058 | exportHistory | Write the board, its notes and every page into one file. |
| 13089 | pickHistoryFile | Ask for one file, and take it in when it arrives. |
| 13124 | importHistory | Take in one exported file. |
| 13169 | toggleBoard | The board the plugin opens when a page is not available. |
| 13182 | showBoard | } |
| 13206 | showOverview | Open the overview page: the board's own button, and the sidebar's row. |
| 13230 | pointInSelection | Whether one right press landed inside the words the reader selected. |
| 13271 | onContextMenu | The way back from a conversation: a right press on its page. |
| 13291 | beginBoardNote | Start typing the line on one card. |
| 13304 | commitBoardNote | Keep what the open field says, and close it. |
| 13319 | cancelBoardNote | Throw the open field away, leaving the card as it was. |
| 13335 | openNote | The note key: open the board on the conversation on screen, with its |
| 13372 | pinToBoard | Put one conversation on the board by hand. |
| 13398 | startOfToday | Midnight today, in the reader's own zone. |
| 13432 | goalByKey | The canvas as it is drawn: one block per workspace in play, the |
| 13458 | nextGoalName | The name a goal cut from a card starts with: the one it came from, plus |
| 13479 | cardVerdictOf | What the reader has said about a conversation, if it still applies. |
| 13497 | noteCardFinished | Write down that a turn ended, before the shell forgets it did. |
| 13517 | goalOfRow | Which goal one conversation is drawn in. |
| 13528 | boardBlocks | } |
| 13727 | rememberFork | Record a fork this plugin watched, and repaint a board that is up. |
| 13751 | inheritForkHome | File a branch in the goal its parent is in. |
| 13774 | revealBoardCard | Bring one card into view, without moving the paper any further than it |
| 13797 | watchForks | Watch the sessions service for forks, so a branch made anywhere in the |
| 13837 | boardPlaces | The places the blocks will be drawn at. |
| 13867 | firstFreeSlot | The first place on the paper no block already stands on. |
| 13899 | slotTaken | Whether a block already stands on a place. |
| 13925 | boardPanelHeights | How tall each painted panel stands, keyed by the block it is. |
| 13946 | boardPanelWidths | How wide each painted panel stands, keyed by the block it is. |
| 13972 | boardExtent | How big the stage has to be to hold everything on it. |
| 14000 | applyBoardZoom | Put the canvas's magnification on the paper. |
| 14023 | setBoardZoom | Zoom the canvas, keeping one point of it where it is on screen. |
| 14055 | fitBoardToWindow | Scale the canvas so the whole of it stands inside the window. |
| 14085 | onBoardResize | A window that changed size re-fits a canvas that was fitted to it. |
| 14095 | onBoardWheel | Ctrl/Cmd + wheel zooms the canvas, the way every canvas does. |
| 14115 | nextCardPlace | Where a new loose card goes when the reader did not point at a place. |
| 14146 | boardFreePlace | A place on the paper for a goal that was just asked for, near the eye. |
| 14189 | addBoardGoal | Stand a new goal on the canvas, ready to be given a purpose. |
| 14211 | closeNewSessionSheet | Take the new-conversation sheet down, and forget what it was writing. |
| 14236 | paintNewSessionBusy | Put the sheet's confirm button in step with the one host round trip. |
| 14252 | paintNewSessionModel | Say which model the sheet would start the conversation on. |
| 14276 | paintNewSessionField | Paint one of the sheet's fields as focused or not. |
| 14287 | watchNewSessionField | Let a field say where the caret is, for as long as it lives. |
| 14302 | openNewSessionSheet | Show the sheet that asks for a conversation's name and the words it opens with. |
| 14511 | commitNewSessionSheet | Read the sheet and start the conversation it describes. |
| 14545 | applyNewSessionModel | Put the model the sheet was set to onto the conversation just made. |
| 14587 | startNewSessionForGoal | Start one conversation under one goal, with the reader's words. |
| 14689 | tidyPanels | The panels as a tidy sees them: a rectangle of paper, the conversations |
| 14760 | tidyHomeOf | Which panel a card belongs beside, if any. |
| 14785 | tidyColumnX | The first x at or right of `x` that no panel already stands in. |
| 14803 | tidyBySession | The order cards stand in beside their panel: the panel's own order. |
| 14809 | tidyByTray | The order the inbox tray keeps: what is finished sinks to the bottom. |
| 14829 | tidyGroup | Lay one group of cards out as a column beside its panel. |
| 14890 | tidyPlan | Where the thoughts still on the paper stand, as a list of places. |
| 14931 | tidyPanelOrder | The order a tidy packs panels in: left to right, top to bottom, tray last. |
| 14953 | tidyRowWidth | How wide one row of a tidy may be, in unzoomed pixels. |
| 14978 | tidyPlaces | Where every panel stands after a tidy. |
| 15020 | tidyBoard | Tidy the canvas: put the thoughts where they belong, then lay the panels |
| 15100 | tidyLooseCards | Put the thoughts that are still on the paper clear of the panels. |
| 15152 | glideTidyPanels | Slide one tidy's panels to their new places, then put the cards around |
| 15206 | glideTidyBatch | Fly one tidy's cards to their places, a beat apart. |
| 15264 | openBoard | Mount the board. |
| 15313 | mountBoardInto | Build the board's parts into a root element, whichever mount owns it. |
| 15624 | unmountBoard | Unmount the board, whichever mount holds it. |
| 15730 | closeBoard | Take the floating board down, element and all. |
| 15757 | boardFieldOpen | Repaint the whole canvas from the feeds. |
| 15783 | renderBoard | } |
| 16006 | boardStatusFingerprint | The board's reading of every card's status, as one string. |
| 16027 | renderBoardOnStatus | Repaint the board for a status tick, but only if something on screen |
| 16042 | tickBoardClocks | Move the running cards' minute hands, in place. |
| 16065 | startDayTimer | Arm the one timer that watches for midnight. |
| 16080 | stopDayTimer | Stop the midnight timer: the board closed, or the page went away. |
| 16087 | startBoardClock | Start the tick that keeps the board's clocks honest. |
| 16098 | stopBoardClock | Stop the tick: the board closed, or nothing on it is running. |
| 16120 | paintHistory | Paint the "only what is marked" toggle to match the state it stands for. |
| 16135 | paintBoardStarFilter | } |
| 16152 | slotHue | One workspace on the canvas: a heading that can be dragged, and the |
| 16165 | slotSeed | Which seat a block starts on: its own id, never its name. |
| 16182 | boardSlots | Give every panel on this paint its own slice of the wheel. |
| 16217 | blockSeat | The seat one block wears: the one written down, else the one this paint gave it. |
| 16237 | goalHue | The hue one place is washed with, or null for the tray. |
| 16243 | blockInk | The colour one panel's own mark wears. |
| 16260 | noteHue | The paper one note is written on. |
| 16264 | notePaper | } |
| 16291 | noteInkOf | The ink one note is drawn in. |
| 16401 | boardIcon | One of those glyphs, at a size, as an element. |
| 16458 | boardNoteCols | How many rows an idea card's field needs for what it holds. |
| 16464 | boardTextRows | } |
| 16489 | boardEditorRows | The lines a card's field opens on. |
| 16517 | boardNoteMetrics | How much paper one idea card takes. |
| 16551 | noteParts | How much paper one idea card takes: its heading, and the lines it holds. |
| 16571 | boardCardBox | How much paper one idea card takes at rest. |
| 16597 | boardCardOpenBox | The paper a note takes while its field is up: all of its body, up to the cap. |
| 16619 | canvasPointOf | Where a point on the screen falls on the paper. |
| 16641 | raiseBoardCard | Bring one card to the front of the paper. |
| 16661 | beginNoteLift | Lift one put-away note out of the tray, under the hand. |
| 16711 | markDropGoal | Say which goal would take the card if the hand let go of it here. |
| 16730 | markDoneDrop | Light the finished strip a carried conversation would land in. |
| 16743 | boardHomeOf | The goal one conversation is drawn in on this paint, or null. |
| 16758 | boardRowOf | One conversation of this paint, by id. |
| 16774 | sendToDone | Put one conversation in the finished strip, word and all. |
| 16791 | bringBackFromDone | Take one conversation back out of the finished strip, word and all. |
| 16810 | markNoDrop | Say, under the hand, that the paper will not take this card. |
| 16836 | dropNoDropTip | Take the "the paper will not take it" line off the page. |
| 16855 | goalNodeAt | The goal panel under a native drag, asked in the order a browser answers. |
| 16867 | nearestGoal | The goal panel an element stands in, or null when it stands in none. |
| 16883 | goalUnder | The goal the pointer is standing in, as the id a card is filed under. |
| 16901 | doneBarUnder | The finished strip under the hand, or null. |
| 16930 | goalHeadKeyUnder | The goal whose heading an element stands in, as the key a card starts a |
| 16955 | boardDragHasText | Whether a native drag carries words, the one thing the shell's rows set. |
| 16993 | sessionInPayload | The words a native drag is carrying, read where the browser allows it. |
| 17020 | boardDragText | } |
| 17038 | clearBoardDragGoal | Take the goal highlight a native drag drew off the paper. |
| 17055 | onNativeDragEnd | A native drag is over, however it ended. |
| 17069 | onBoardDragOver | Say, while a native drag is over the canvas, which goal would take it. |
| 17085 | onBoardDragLeave | The native drag left the canvas: take the goal highlight with it. |
| 17105 | onBoardDrop | A conversation let go on the canvas, carried in from the host's sidebar. |
| 17132 | dropSessionOntoBoard | Take one conversation the reader dragged in, and keep it. |
| 17157 | buildSeatMenu | The twelve colours a goal can wear. |
| 17190 | pickSeat | One colour, as a press. |
| 17215 | buildGoalMenu | The verbs on a goal that are not worth a seat of their own. |
| 17238 | goalMenuItem | One line of that menu. |
| 17269 | placeGoalMenu | Stand a goal's menu under its ⋯, inside the panel's right edge. |
| 17274 | buildBoardBlock | } |
| 17685 | trayCaption | The conversations of one block, cut into threads. |
| 17700 | trayQuiet | A quiet line where a section has nothing in it yet. |
| 17718 | buildTrayNote | One note, as a line of the tray. |
| 17866 | trayInk | Ink every conversation inside one node with the tray's paper. |
| 17878 | doneBinCards | Every note put away in the finished-cards bin, newest first. |
| 17883 | doneBinCardsOf | The put-away notes one conversation was handed, newest first. |
| 17902 | openDoneBinFor | Open the bin on one conversation's own put-aways. |
| 17917 | paintDoneBin | Say how many cards the bin holds, and what it is doing. |
| 17932 | toggleDoneBin | Open or close the finished-cards list. |
| 17950 | buildDoneRow | One finished note, as a line of the card's list. |
| 18037 | mountDoneBin | Put the finished-cards list on the board, or take it away. |
| 18125 | ejectFromDoneBin | Put one card back on the paper, out of the finished-cards bin. |
| 18144 | buildInboxBody | The tray's body: the conversations nothing accounts for, and the notes put away here. |
| 18189 | boardBlockColumns | How many columns a panel reads across. |
| 18205 | boardCardStacked | Whether one card is drawn inside a conversation's column. |
| 18228 | boardBlockWidth | How wide a panel stands. |
| 18252 | buildBoardColumns | A goal's conversations, laid out across the panel. |
| 18294 | buildBoardColumn | One conversation of a panel, as the column it stands in. |
| 18322 | buildDoneBar | The long strip at the foot of a goal: what the reader finished today. |
| 18401 | buildQuietStrip | The conversations a panel carried in and nobody has touched, one line each. |
| 18457 | buildQuietRow | One quiet conversation, as the line it is drawn as. |
| 18529 | buildQuietStack | The thoughts under one quiet conversation, once its count was pressed. |
| 18548 | buildBoardStack | The thoughts filed under one conversation. |
| 18614 | markCardFresh | Wear the one beat a completion is worth - once. |
| 18652 | verdictText | The word one conversation wears, in the reader's language. |
| 18669 | buildVerdictChip | What the reader said about a card, as the chip that says it. |
| 18696 | buildStateAdd | The empty seat, for a card the shell has nothing to say about. |
| 18716 | stateToggle | Open or close one card's state menu. |
| 18737 | buildVerdictMenu | The two words, and the way back to having said nothing. |
| 18757 | verdictItem | One word in that menu. |
| 18790 | clearVerdictItem | The row that takes the word back. |
| 18810 | buildBoardCard | } |
| 19278 | beginBlockRename | Start typing a goal's name into its heading. |
| 19284 | commitBlockRename | Keep the name the heading says, and close the field. |
| 19296 | cancelBlockRename | Throw the typed name away, leaving the goal as it was called. |
| 19313 | goalBaseName | The last piece of a workspace path: what the workspace is called. |
| 19326 | beginGoalIntent | Start writing what a goal is for. |
| 19341 | commitGoalIntent | Keep what the open line says, and close it. |
| 19353 | cancelGoalIntent | Throw the typed line away, leaving the goal as it was. |
| 19372 | removeBoardGoal | Take one goal off the canvas, with a few seconds to bring it back. |
| 19419 | boardNameCollisions | Which drawn cards share a name, and where each one stands in its group. |
| 19445 | boardTitleOf | The name one card wears: the reader's word while the shell catches up, |
| 19461 | noteCardTitle | Put the reader's word on a card before the shell has answered. |
| 19476 | settleTitles | Let go of the stand-in names the feed has caught up with, or outlived. |
| 19495 | beginBoardRename | Start renaming one conversation from its card. |
| 19513 | commitBoardRename | Keep what the open name field says, and rename the conversation. |
| 19552 | cancelBoardRename | Throw the open name field away, leaving the conversation as it was. |
| 19571 | forkBoardCard | Start a branch from one conversation, and draw the line when it lands. |
| 19617 | returnForkMark | Let a conversation's branch mark answer again, and say so on the card. |
| 19633 | waitForBranchRow | The catalogue row for one conversation, asked for until it arrives. |
| 19665 | settleBranchName | Give a fresh branch a name nobody else is using, and answer with it. |
| 19708 | pasteIntoComposer | Put words in the message box of the conversation on screen. |
| 19742 | composerHasText | Whether the message box already holds something. |
| 19758 | boxHasText | Whether one box already holds words. |
| 19773 | seatCaretAtEnd | Put the caret at the end of the box's content. |
| 19812 | dropCardIntoComposer | Hand one loose card's words to a conversation's message box. |
| 19832 | pasteIntoBoxNow | Put the words in the box that is on screen right now, if there is one. |
| 19854 | putThroughEditor | Put text into the editor through the editing command. |
| 19873 | pasteThroughEvent | Put text into the editor as a real paste event. |
| 19899 | ideaFocusCard | One card from the board's own document, by id. |
| 19919 | ideaFocusOrigin | Where a press happened, as a point the sheet can grow out of. |
| 19944 | animateIdeaFocusIn | Let the sheet grow out of the place the reader pointed at. |
| 19987 | ideaFocusSessionTitle | The name of the conversation a thought is tied to, for the sheet's foot. |
| 20008 | paintIdeaFocusDone | Keep the sheet's done box in step with the card it belongs to. |
| 20029 | cleanIdeaTitle | Keep the title on one line while letting it wrap on the paper. |
| 20037 | growIdeaTitle | Let the title field take as many lines as the words it is showing. |
| 20056 | writeIdeaFocus | Write what the sheet says into the card it belongs to. |
| 20080 | openIdeaFocus | Open one idea card, or a blank new one, in the centre of the board. |
| 20324 | closeIdeaFocus | Close the sheet, keeping what it says. |
| 20375 | deliverIdeaFocus | Hand the sheet's thought to the conversation it is tied to. |
| 20399 | buildIdeaMenu | The menu behind a thought card's ⋯. |
| 20442 | ideaMenuItem | One line of that menu. |
| 20471 | buildSessionMenu | The verbs on a conversation card that are not worth a seat of their own. |
| 20512 | placeCardMenu | One line of that menu. |
| 20529 | cardMenuItem | } |
| 20568 | buildBoardLooseCard | One loose card: a thought the reader put on the canvas rather than in a |
| 20919 | boardJoinText | Join a card's two parts back into the one string the store keeps. |
| 20938 | beginBoardCard | Start typing into one loose card - at its title, or at its body. |
| 20978 | boardTakeCardText | Keep what the open field says, and close it. |
| 20995 | commitBoardCard | } |
| 21008 | cancelBoardCard | Throw the open field away, leaving the card as it was last written. |
| 21029 | settleBoardCardForPress | Settle the open card field for a press, without the paint a settle |
| 21052 | addBoardCardAt | Open a new thought at a place, and let the sheet write it. |
| 21069 | addBoardCard | Open a new thought where the reader is looking, or below everything when |
| 21086 | removeLooseCard | Take one loose card off the canvas. |
| 21131 | removeBoardCard | Take one conversation off the board. |
| 21173 | handleOf | A press on a block's heading: the handle the panel is dragged by. |
| 21202 | beginStackedCarrier | Lift one card out of a conversation's column, where the hand is. |
| 21241 | stackCardBefore | The card a drop should sit above, from where the pointer let go. |
| 21269 | closeIdeaMenu | Mark the column the hand is over, or clear every mark. |
| 21286 | closeSeatMenu | Put the colour wheel away, without a repaint. |
| 21306 | closeGoalMenu | Put a goal's ⋯ menu away, without a repaint. |
| 21326 | closeVerdictMenu | Put a card's state menu away, without a repaint. |
| 21345 | closeSessionMenu | Put a conversation card's menu away, without a repaint. |
| 21361 | paintStackDrop | } |
| 21379 | paintHeadDrop | Light the heading of the goal a carried card would start a conversation in. |
| 21398 | parkCardOutside | Give a card lifted out of a column a place on the paper. |
| 21425 | boardPointerDown | The one press handler on the canvas. |
| 21577 | boardNoteDone | Put the drop bands on screen, or take them away. |
| 21585 | showDropZones | } |
| 21600 | boardListen | Start listening for the rest of a gesture, once it has been armed. |
| 21617 | beginSessionGrab | Start a session drag: a sort inside its own panel, a carry outside it. |
| 21635 | panelHolds | Whether a hand is still close enough to its panel to be sorting inside it. |
| 21653 | beginSessionReorder | Sort one conversation among its neighbours, where the hand is. |
| 21712 | paintSessionReorder | Follow the hand, and let the other columns make room as it passes them. |
| 21750 | sessionSlotAt | The place the hand is asking for, read off the grid. |
| 21796 | leaveSessionReorder | Hand the drag back to the carrier, because the pointer left the panel. |
| 21809 | resetSessionReorder | Put every column back where the paint left it. |
| 21835 | commitSessionReorder | Write the order the hand chose, once, and draw it. |
| 21873 | beginSessionCarrier | Give a carried card its body, where the hand is. |
| 21915 | onBoardMove | Follow the pointer: pan the paper, or carry what the hand picked up. |
| 22036 | onBoardUp | Let go: write down what the gesture decided, unless it never moved. |
| 22314 | handCardToSession | Hand one loose card's words to a conversation, and leave a trace behind. |
| 22340 | nameSessionForCard | Let the conversation a card was handed to wear the card's own name. |
| 22370 | drawCardLinks | Draw the elbow from every branch back to the conversation it was cut from. |
| 22426 | cancelBoardDrag | Drop the gesture and put back what it was carrying. |
| 22436 | endBoardDrag | Take the gesture's furniture off the page and forget it. |
| 22482 | onBoardBlurDrag | The window losing focus mid-gesture: the pointer left with it. |
| 22497 | onBoardDoubleClick | A double click on the paper: write a card right there. |
| 22546 | makeNotice | The transient line the plugin speaks in. |
| 22769 | showToast | Say one thing for a moment. A second press replaces the line and restarts |
| 22774 | hideToast | Take the notice down and drop the pending timer. |
| 22788 | SendHintLine | The line that names the send key, contributed to the shell's own dock row |
| 22820 | sendKeyLabel | The modifier this machine's send accelerator lives on, named the way the |
| 22839 | modelDirectories | The host's session model-selection service, when it publishes one. |
| 22855 | effortLevels | The reasoning levels one model offers, in the order the composer's own |
| 22879 | levelIndex | Where one level sits in the list. An explicit selection wins; without one |
| 22900 | currentLevelId | The level in effect for one selection, read the way the composer's own |
| 22911 | isCurrentEntry | Whether one entry is the model the conversation is already on. |
| 22929 | rowMarkedLevel | The level one picker row shows as marked, which is the level it would end |
| 22949 | rowSubmitLevel | The level one picker row would submit if it were confirmed without the |
| 22962 | refusal | A refusal this plugin can explain on its own, so the notice carries |
| 22981 | cycleEffort | One press of the reasoning key: step the visible conversation's level one |
| 23015 | stepEffort | Read the levels off one session directory and submit the next one. |
| 23065 | catalogGroups | Every provider/model the host currently advertises, for the settings page. |
| 23103 | groupsOf | The provider groups out of one loaded catalog or directory snapshot. Both |
| 23121 | offeredModels | The catalog as a lookup, one entry per `provider/model`. |
| 23159 | modelEntries | The configured models the directory currently offers, in the order the |
| 23171 | modelIndex | Where one model sits in the list; -1 when it is not one of them. |
| 23188 | modelDirectoryOfCurrent | Resolve the model directory behind the conversation on screen. |
| 23219 | readModelList | Read the list off one session directory. |
| 23263 | readNewSessionModelList | The list the sheet's model row offers. |
| 23286 | openNewSessionModelPick | Open the model window for the sheet's model row. |
| 23326 | openModelPick | One press of the model key: open the picker on the list of models the |
| 23538 | modelPickHint | The line under the picker: what it is showing, and what the keys do. |
| 23567 | renderModelPick | Repaint the picker's rows and footer from `MODELPICK.entries`. |
| 23590 | markedLevel | The level one row is currently marked with. |
| 23605 | confirmLevel | The level one confirm would submit. |
| 23628 | buildModelRow | One row of the picker: the model's name with the `current` tag in front of |
| 23683 | buildLevelCell | The levels of one model. |
| 23736 | levelClickHandler | The press handler for one level chip. |
| 23750 | keepModelPickVisible | Keep the selected row in sight when the list is longer than the card. |
| 23772 | openModelWindow | Mount the picker, with the selection already on the model in effect. |
| 23838 | closeModelPick | Unmount the picker and forget everything it was showing. |
| 23874 | moveModelPick | Move the picker's selection, wrapping at both ends. |
| 23902 | moveModelPickEntry | Put the selected model somewhere else in the list, and remember it there. |
| 23942 | reorderFavorites | Put an ordered list of pairs back into the configured one, in the new |
| 23970 | stepModelPickLevel | Step the level of the selected row, wrapping at both ends. |
| 23999 | confirmModelPick | Confirm the selected row: submit its model at its marked level, then take |
| 24064 | modelToast | The one-line notice after a switch, naming the level when the row has one. |
| 24076 | levelName | The readable name of one level of one model, or null when there is none. |
| 24098 | modelPickKeyDown | Route one keystroke to the open picker. |
| 24176 | switchModel | Read the catalog off one session directory and submit the model and level |
| 24277 | makeTranslator | Translate through the locale seat when it is wired, else through the |
| 24293 | KeyRow | One rebindable key: focus the box, press the key you want. |
| 24333 | SliderRow | One numeric preference. |
| 24363 | ChoiceRow | A short set of mutually exclusive options, as a row of toggles. Used for |
| 24409 | ModelListGroup | The switchable models as one settings group: what is chosen, in the order |
| 24602 | VimSection | The whole Settings → Vim scrolling page. |
| 24842 | BoardPage | The board as the main panel's page. |
| 24877 | BoardPanelIcon | The sidebar entry's glyph: three columns, which is what the board is. |
| 24922 | installBoardPage | Contribute the board as a sidebar entry and a main panel. |
| 24986 | overviewToday | What today did, as the overview reads it. |
| 25079 | overviewFigure | One figure: the number, and what it counts, read as one block. |
| 25097 | overviewNumber | One number in the table: how it reads depends on what it counts. |
| 25106 | overviewHeading | One heading of the table, in the same columns as its rows. |
| 25124 | mountOverviewInto | Build the overview into an element the host owns. |
| 25256 | OverviewPage | The overview as the main panel's page. |
| 25292 | OverviewPanelIcon | The sidebar entry's glyph: three bars of a day, rising to the right. |
| 25338 | installOverviewPage | Contribute the overview as a page of its own, beside the board. |
| 25395 | installWindowCSS | The rules every window this plugin mounts shares, once. |
| 25439 | installBoardCSS | Put the board's hover and motion rules on the page, once. |
| 25615 | installSettings | Contribute the settings page and its vocabulary. Both contributions are |
| 25691 | makeApi | Debug and tuning surface, also used by tools/selftest.mjs. |
| 26037 | apply | Client activation. |
