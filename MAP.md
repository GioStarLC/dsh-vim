# MAP - lib/client.js

由 `npm run map` 生成，不要手改。找一个功能的入口：先在这里按名字查到行号，再读那一段。

lib/client.js：28465 行，557 个顶层函数。

| 行 | 函数 | 上方注释 |
|---:|---|---|
| 1480 | localeIsZh | Best-effort locale guess, used for the nav label and fallback strings. |
| 1504 | defaults | Shipped defaults as a fresh object, derived from DEFAULTS so a new |
| 1514 | copy | Current preferences as a fresh object. |
| 1538 | isBindableKey | A single printable character, or one of `NAMED_KEYS`, is the only thing |
| 1554 | normalizeKey | Normalise a bound key to its stored form: lower case for characters, |
| 1570 | keyLabel | How a bound key reads in the settings box. A space is invisible in a box |
| 1577 | clampNumber | Clamp a numeric preference to its accepted range. |
| 1593 | sanitizeFavorites | The switchable models as a fresh list of `{provider, model}` pairs. |
| 1612 | persist | Persist the current preferences; storage failures are not fatal. |
| 1621 | announce | Notify the settings page that preferences changed. |
| 1636 | applyPatch | Validate and apply one patch. Rejected patches leave preferences intact. |
| 1710 | firstFree | The preferred key when it is free, else the first free letter. |
| 1730 | repairKeys | Force each key group to be conflict-free. Groups are repaired back to |
| 1794 | migrateArchiveSeat | Move the archive seat into place for a store written before it existed. |
| 1810 | load | Read stored preferences over the defaults. |
| 1863 | setStage | Mark one conversation, or take the mark off it, and repaint. |
| 1880 | stageHandler | The press handler for one stage word on one row. |
| 1897 | cyclePhase | Advance one conversation to the next stage, and repaint the window. |
| 1908 | subscribe | Subscribe to preference changes. |
| 1945 | isEditable | True when the element consumes printable characters itself. |
| 1959 | isScrollable | True when the element is a non-editable box that overflows vertically and |
| 1972 | parentOf | Parent element, crossing shadow boundaries through the host node. |
| 1983 | scrollerFrom | Nearest scrollable ancestor, inclusive. |
| 1993 | largestScroller | Largest visible scroll container; the last-resort target. |
| 2016 | elementAt | The topmost element at a point, when the document can be asked. A host |
| 2037 | pickScroller | Choose the container to scroll. Deterministic order: whatever sits under |
| 2061 | canMove | Whether the container still has room in the requested direction. |
| 2073 | resolveTarget | Walk from the picked container up to the first one that can move. This is |
| 2083 | reducedMotion | Honour the OS "reduce motion" preference. |
| 2093 | suppressSmooth | Pin `scroll-behavior: auto` for the animated element. Without this, a |
| 2102 | stopAnim | Stop the animation loop and restore anything it changed. |
| 2119 | frame | One animation frame: ease `current` toward `target`, frame-rate |
| 2145 | push | Queue a scroll step. Resolves (or reuses) the container, extends the |
| 2172 | stopHold | Cancel the held-key auto-repeat. |
| 2184 | tickHold | Auto-repeat tick: one more step, then schedule the next sooner. |
| 2205 | startHold | Start a hold: one immediate step, then our own accelerating repeat. The |
| 2222 | directionOf | Which direction a pressed key drives, if any. |
| 2237 | onKeyDown | Capture-phase key handler. Runs before the app's own handlers so the |
| 2665 | onKeyUp | Any keyup ends the hold, so a dropped keyup cannot leave the view scrolling. |
| 2691 | onEscapeBlur | Escape leaves a focused composer, so the scroll keys come back. |
| 2716 | onPointerMove | Remember where the pointer is. |
| 2737 | forgetPointer | Forget the remembered pointer, so the focus and centre rules decide again. |
| 2742 | onUserScroll | The user took over with the wheel or a touch: abandon our animation. |
| 2761 | onFocusLoss | Losing the window or the tab must not leave a hold or a stale pointer |
| 3269 | makeTurnPeek | The ledger behind `TURNS`, and the only thing that touches it. |
| 3355 | makeSaidPeek | The ledger behind `SAID`, and the only thing that touches it. |
| 3475 | makePhaseLedger | The ledger behind `PHASES_MODEL`, and the only thing that touches the |
| 3590 | makeRunLedger | The ledger behind `RUNS`, and the only thing that touches it. |
| 4187 | solidPaper | A wash made solid: the tints, laid over the board's own base colour. |
| 6740 | applyBoardPageInk | Paint the page with the host's theme. |
| 6793 | sizePanel | Fit the panel to the configured size. |
| 6806 | placementMargin | How far the panel is held off the edge it is parked against. |
| 6818 | placePanel | Park the panel according to the configured position. The one place that |
| 6846 | serviceOf | One host service, however this context publishes it. These two are read |
| 6865 | taskServices | The session feed, the workspace registry, and the workspace navigator. |
| 6894 | statusFor | The shell's unified status entry for one conversation, if it publishes one. |
| 6911 | currentSession | The conversation on screen, as the shell's own shortcuts see it: the one |
| 6931 | currentSessionRunning | True when the conversation on screen has a turn in flight. |
| 7008 | watchEntries | Follow the conversation on screen for the life of the page, so an |
| 7035 | noteEntry | Start the arrival of one conversation, unless this one already had its |
| 7058 | cancelEntry | Drop the pending placement without touching what was already decided. |
| 7068 | stopEntries | Stop following arrivals; the next page arms its own watch. |
| 7093 | settleEntry | One frame of an arrival: wait until the page shows this conversation at |
| 7173 | entryRunning | Whether the conversation still has a turn in flight, or null while the |
| 7191 | lastInputRow | The last message a person wrote in the transcript, if one is on screen. |
| 7212 | entryScroller | The box a transcript row scrolls in: the nearest ancestor that declares |
| 7233 | anchorEntry | Put one transcript row at the top of its scrollport, within the box's |
| 7260 | settleEntryScroll | Let the shell treat the placement as a finished reading move. |
| 7282 | statusOf | What one conversation is doing right now, as a short label. |
| 7302 | turnsOf | The turn count already peeked for a conversation, or null. |
| 7312 | statusIsLive | True for the statuses that mean a turn is in flight: one that is running, |
| 7340 | noteDeliveries | Note the turn ends: a conversation this page watched run, no longer running. |
| 7366 | syncRuns | } |
| 7383 | watchRuns | Follow the status source for the life of the page, so a turn is stamped |
| 7406 | loadRunStamps | Read the stamps the previous page left behind, dropping the ones that are |
| 7414 | forgetRuns | Stop watching, and forget every stamp the watch had taken. |
| 7423 | runSince | The moment the turn in flight in one conversation was seen to start. |
| 7439 | elapsedText | How long a turn has been in flight, at minute resolution. |
| 7457 | tickClocks | Repaint the live chips, in place. |
| 7487 | clockDelay | Milliseconds until the next whole minute of the oldest clock given. |
| 7498 | startClock | Start the tick that keeps the clocks on screen honest. |
| 7509 | stopClock | Stop the tick: the window closed, or nothing on screen is running. |
| 7547 | donePulseAmount | How far into the beat `progress` (0..1) is, as a 0..1 swell. |
| 7561 | paintDonePulse | Paint the beat on every "just finished" chip on screen. |
| 7577 | tickDonePulse | One frame of the beat; schedules the next, or puts the chips back. |
| 7601 | startDonePulse | Start the beat, unless there is nothing to point at or the OS asked for |
| 7609 | stopDonePulse | Cancel the beat and put every chip it touched back. |
| 7627 | requestTurns | Queue a turn count for every loaded row that does not have one yet. |
| 7640 | drainPeeks | Start as many queued peeks as the concurrency budget allows. |
| 7661 | wantSaidFor | Ask what each conversation was last given, before its card is built. |
| 7679 | drainSaid | Start the asks the budget allows, and paint what lands. |
| 7700 | promptOf | The last words a conversation was given, out of its turn outline. |
| 7722 | peekSaid | Read one conversation's last prompt, and let go of it again. |
| 7820 | peekTurns | Read one session's `sessionStats.turns` and let go of it again. |
| 7889 | cancelPeeks | Drop every queued and in-flight peek; the window closed or unloaded. |
| 7894 | paletteText | Built-in string for the task window; it is plugin chrome, not shell copy. |
| 7905 | relativeTime | Coarse "how long ago" for a row. Deliberately four buckets, so a list |
| 7916 | paletteHint | Footer hint, rebuilt from the live bindings and the current depth. |
| 7975 | paletteHeadline | The one line above the list: what is on the reader's plate right now. |
| 8010 | conversationPool | Every conversation worth offering, newest first. |
| 8057 | sortByRecency | Sort rows by recency, newest first, with the id as a deterministic |
| 8076 | hereIndex | Where the conversation on screen sits in a list, or 0 when it is not |
| 8102 | firstOwedIndex | Where the selection opens: the first thing waiting on the reader, else |
| 8135 | attentionOf | Which attention block a conversation belongs to, or null for the plain |
| 8179 | paletteBlocks | Split the pool into the attention blocks and the browsing blocks. |
| 8255 | waitedSince | How long a conversation has been waiting on the reader, as a stamp. |
| 8274 | revealMore | Reveal one more batch of older conversations. |
| 8319 | paletteSections | The blocks to draw, in order, each with its header. |
| 8358 | rebuildRows | Rebuild `rows` and `sections` from the two blocks. |
| 8384 | folderIndex | Which folder each conversation lives in, as `{ label, path }` keyed by |
| 8421 | folderById | One workspace, by the id the board files its goals under. |
| 8453 | workspaceForGoal | The workspace a new conversation started from one goal would join. |
| 8482 | boardBlockByKey | One goal of the last paint, by the key a card is filed under. |
| 8496 | folderLabel | What a folder reads as on a row: the Workspace's own title, else the last |
| 8528 | rowColumns | The row grid: the state chip, the name, and the metadata — tag, stage, |
| 8548 | columnOf | The grid column one cell belongs to, on this repaint. |
| 8561 | widestCell | The widest content width among one column's cells. |
| 8587 | fitColumns | Give every row the same tracks, sized to what is actually on screen. |
| 8619 | namesOwnFolder | Whether a row in this block has to name its own folder. |
| 8631 | buildRow | One list row. Clicking it switches, so the window is not keyboard-only. |
| 8815 | buildRenameInput | The name box that replaces a row's title while it is being renamed. |
| 8850 | focusRename | Put the caret in the name box, with the whole name selected the first time |
| 8874 | beginRename | Start renaming the selected conversation. |
| 8883 | cancelRename | Drop the edit and repaint the row as it was. |
| 8897 | commitRename | Hand the typed name to the host. |
| 8934 | renameSession | Rename one conversation, the way the shell's own sidebar does it: retain |
| 8984 | archiveSession | Archive the selected conversation, through the host's own action. |
| 9024 | archiveFailureText | A reason from whatever the host rejected an archive with. |
| 9045 | archiveSelected | Archive the selected row, with the footer saying what happened. |
| 9066 | failureText | A short reason from whatever the host rejected with: a remote failure |
| 9078 | setPaletteNotice | Say something in the footer. The next repaint restores the hint, so a |
| 9093 | resetPaintScratch | Put this repaint's measurements away, ready for the next one. |
| 9109 | renderPalette | Repaint the list from `PALETTE.sections`; cheap enough at this size. |
| 9180 | moreReachable | Whether the "More" seat has anything left to give. |
| 9197 | buildSectionHeader | One block heading. It is not selectable and not a row: it names the block |
| 9241 | scrollSelectionIntoView | Keep the cursor visible when the list is longer than the panel. |
| 9255 | moreHeadingNode | The "More" heading element currently on screen, or null. |
| 9281 | refreshPalette | Re-read both feeds, holding the selection on the same conversation and |
| 9327 | selectedRow | The conversation under the cursor, or null when the cursor is standing on |
| 9343 | moreSeatAt | Where the "More" seat stands in the row order, as a row index. |
| 9366 | moveSelection | Move the selection, wrapping at both ends. |
| 9410 | activateSelection | Act on whatever the selection is standing on. |
| 9422 | openPalette | Mount the window and read the feed. Rolling state is torn down first: |
| 9534 | closePalette | Unmount the window and drop every feed subscription. |
| 9594 | paletteKeyDown | Route one keystroke to the open window. |
| 9718 | composerRoot | The message box: the rich-text editor root the shell puts the caret into. |
| 9735 | rememberComposer | Remember the element a focus landed on. It is the fallback for a host |
| 9752 | isComposerEditor | True when an element is a rich-text editor, i.e. the message box — and |
| 9768 | noteFocusRequest | Mark that the user just asked for the keyboard themselves, so the focus |
| 9787 | clearFocusRequest | Drop a request the user has just superseded by doing something else. |
| 9802 | isActivating | True for a control a bare Space activates by itself. Such a control keeps |
| 9815 | focusComposer | Put the keyboard in the message box: what the focus key is for. |
| 9840 | composerIsEmpty | True when the message box holds nothing the user put there. |
| 9863 | leaveEmptyComposer | The focus key pressed again, inside the box it put the caret in: hand the |
| 9891 | inComposer | True when a keystroke was aimed at the message box. |
| 9914 | menuOpen | True while a suggestion menu is waiting to be confirmed. |
| 9943 | onSendKey | True when this keystroke is a send, and the keyboard should not stay in |
| 9972 | doubleEnterSends | True when this Enter is the second half of a double-Enter send. |
| 10002 | sendFromComposer | Send the draft by handing the host the key it already sends with. |
| 10053 | handBackAfterSend | Give the keyboard back to the page after a send, without waiting for a |
| 10084 | breakLine | Turn a bare Enter into the host's own line break. |
| 10138 | onFocusIn | Keep the message box from taking the keyboard on its own. |
| 10164 | noteFocusReturn | Widen the licence to a focus arriving right after the window got the |
| 10176 | justReturned | Whether a focus arriving now is the tail of the window coming back. |
| 10188 | onPointerDown | A press says where the keyboard should be: inside a text field it asks |
| 10213 | dismissOutsidePress | Put an open window away when the press landed beside it. |
| 10249 | pressMissesWindow | Whether a press landed outside an open window's card. |
| 10265 | activateSession | Switch the main view to one conversation. |
| 10326 | reportStoreFull | Say that the board could not be written, once. |
| 10333 | makeBoardStore | } |
| 12051 | makeHistory | The board's history: what was done, and how to put it back. |
| 12175 | makeNoteStore | The lines pinned to conversations, and the only thing that touches them. |
| 12288 | makeHandoffStore | The words handed to a conversation the board was not standing in. |
| 12428 | makeHistoryStore | The history's own store: one record per local day, in IndexedDB. |
| 12609 | makeJournal | The sessions a day inherited, kept where a repaint can reach them. |
| 12784 | makeCarryStore | } |
| 12879 | dayOf | The local day a moment belongs to, as `YYYY-MM-DD`. |
| 12888 | daysBetween | How many local days lie between two `YYYY-MM-DD` days. |
| 12898 | readMoment | The page the board last drew, as it was left, or null. |
| 12912 | forgetMoment | Forget the page that was left, once it has been filed. |
| 12936 | noteMoment | Remember the page this repaint draws. |
| 12960 | momentHeld | Whether the store still holds exactly the bytes this page last wrote. |
| 12979 | pageDoc | The arrangement a day's page keeps. |
| 13005 | pageView | The page as it reads, frozen. |
| 13065 | settleDay | File the page that was left, and start today. |
| 13100 | filePage | Write one page, and keep the history's size honest. |
| 13133 | settleCarry | Carry the members of the page just filed into today. |
| 13150 | pruneHistory | Keep the newest `snapshotKeepDays` pages, and no more. |
| 13168 | dropCarried | Let go of the conversations carried longest with no movement. |
| 13196 | maybeShowSeal | Show the day that just ended, once, the first time the board is up after it. |
| 13218 | sealCounts | The counts one day's summary reads off. |
| 13239 | sealLeft | What the desk still owes the reader, as of this press. |
| 13268 | paintSeal | Draw one day's summary. |
| 13344 | closeSeal | Take the day's summary down. |
| 13355 | historySearchRow | The one-line search above the days. |
| 13388 | searchHistory | Find a sentence across the pages, newest first. |
| 13430 | historyMatches | The lines of one page that carry the needle: its cards, its notes, its names. |
| 13458 | historyHitRow | One page a search found, with the lines it was found by. |
| 13496 | openBoardHistory | Open the history: a calendar of the pages the board has been. |
| 13576 | closeBoardHistory | Take the calendar down. |
| 13596 | renderHistory | Draw the calendar. |
| 13620 | historyNote | One quiet sentence where a page would be. |
| 13628 | historyMeta | How a page reads at a glance: what it was made of. |
| 13639 | monthOf | The month a `YYYY-MM-DD` day belongs to, or '' when it is not a day. |
| 13644 | addMonths | One month, stepped by whole months, as `YYYY-MM`. |
| 13656 | historyMonthLabel | How a month reads: the reader's own words, not a timestamp. |
| 13673 | historyCalendar | The month grid: every day the board has a page for, one cell each. |
| 13720 | historyCalendarHead | The month between the two steps, which are only presses when they lead somewhere. |
| 13767 | historyCalendarCell | One day in the calendar. |
| 13813 | viewDay | Stand the canvas on one past day. |
| 13842 | backToToday | Put the canvas back on today. |
| 13864 | paintBoardActions | Show the heading's working chips, or put them away. |
| 13883 | paintHistoryPage | Draw one past day on the canvas. |
| 13964 | historyBlocks | A page's goals, with their conversations put back under them. |
| 13995 | historyPlaces | Where each of a page's panels stood, keyed by block. |
| 14014 | historyCardPlaces | Where each of a page's thoughts stood, or where an older page's thoughts |
| 14047 | buildHistoryBlock | One panel of a page: the same box as today's, with nothing in it that can |
| 14112 | buildHistoryRow | One conversation of a page: the name and the word it wore. |
| 14151 | historyChipStyle | The chip a status word wore: the same three colours the live canvas uses. |
| 14166 | buildHistoryCard | One thought of a page: the words, on the paper they were written on. |
| 14194 | paintHistoryBanner | The bar a page wears: the day, what it is, and the presses that belong to it. |
| 14280 | removeHistoryBanner | Take a page's bar down. |
| 14296 | restoreDay | Copy one page into today. |
| 14321 | applyPageOrder | Put the page's own arrangement back onto the panels. |
| 14339 | settleRestoredCarry | Seat a restored page's members as today's carried set. |
| 14353 | keepBackup | Keep what a restore or an import is about to replace. |
| 14366 | takeBeforeBackup | Take back what the last restore or import replaced. |
| 14384 | downloadJson | Hand a file to the browser. |
| 14418 | exportHistory | Write the board, its notes and every page into one file. |
| 14449 | pickHistoryFile | Ask for one file, and take it in when it arrives. |
| 14484 | importHistory | Take in one exported file. |
| 14529 | toggleBoard | The board the plugin opens when a page is not available. |
| 14542 | showBoard | } |
| 14566 | showOverview | Open the overview page: the board's own button, and the sidebar's row. |
| 14590 | pointInSelection | Whether one right press landed inside the words the reader selected. |
| 14625 | leaveBoardPage | Leave the board's page for the conversation it was opened from. |
| 14655 | onContextMenu | The way between a conversation and the board: a right press, both ways. |
| 14679 | beginBoardNote | Start typing the line on one card. |
| 14692 | commitBoardNote | Keep what the open field says, and close it. |
| 14707 | cancelBoardNote | Throw the open field away, leaving the card as it was. |
| 14723 | openNote | The note key: open the board on the conversation on screen, with its |
| 14760 | pinToBoard | Put one conversation on the board by hand. |
| 14786 | startOfToday | Midnight today, in the reader's own zone. |
| 14820 | goalByKey | The canvas as it is drawn: one block per workspace in play, the |
| 14846 | nextGoalName | The name a goal cut from a card starts with: the one it came from, plus |
| 14867 | cardVerdictOf | What the reader has said about a conversation, if it still applies. |
| 14885 | noteCardFinished | Write down that a turn ended, before the shell forgets it did. |
| 14905 | goalOfRow | Which goal one conversation is drawn in. |
| 14916 | boardBlocks | } |
| 15124 | rememberFork | Record a fork this plugin watched, and repaint a board that is up. |
| 15148 | inheritForkHome | File a branch in the goal its parent is in. |
| 15171 | revealBoardCard | Bring one card into view, without moving the paper any further than it |
| 15194 | watchForks | Watch the sessions service for forks, so a branch made anywhere in the |
| 15234 | boardPlaces | The places the blocks will be drawn at. |
| 15264 | firstFreeSlot | The first place on the paper no block already stands on. |
| 15296 | slotTaken | Whether a block already stands on a place. |
| 15322 | boardPanelHeights | How tall each painted panel stands, keyed by the block it is. |
| 15343 | boardPanelWidths | How wide each painted panel stands, keyed by the block it is. |
| 15369 | boardExtent | How big the stage has to be to hold everything on it. |
| 15399 | applyBoardZoom | Put the canvas's magnification on the paper. |
| 15422 | setBoardZoom | Zoom the canvas, keeping one point of it where it is on screen. |
| 15454 | fitBoardToWindow | Scale the canvas so the whole of it stands inside the window. |
| 15484 | onBoardResize | A window that changed size re-fits a canvas that was fitted to it. |
| 15494 | onBoardWheel | Ctrl/Cmd + wheel zooms the canvas, the way every canvas does. |
| 15514 | nextCardPlace | Where a new loose card goes when the reader did not point at a place. |
| 15545 | boardFreePlace | A place on the paper for a goal that was just asked for, near the eye. |
| 15588 | addBoardGoal | Stand a new goal on the canvas, ready to be given a purpose. |
| 15610 | closeNewSessionSheet | Take the new-conversation sheet down, and forget what it was writing. |
| 15635 | paintNewSessionBusy | Put the sheet's confirm button in step with the one host round trip. |
| 15651 | paintNewSessionModel | Say which model the sheet would start the conversation on. |
| 15675 | paintNewSessionField | Paint one of the sheet's fields as focused or not. |
| 15686 | watchNewSessionField | Let a field say where the caret is, for as long as it lives. |
| 15701 | openNewSessionSheet | Show the sheet that asks for a conversation's name and the words it opens with. |
| 15910 | commitNewSessionSheet | Read the sheet and start the conversation it describes. |
| 15944 | applyNewSessionModel | Put the model the sheet was set to onto the conversation just made. |
| 15992 | startNewSessionForGoal | Start one conversation under one goal, with the reader's words. |
| 16087 | tidyPanels | The panels as a tidy sees them: a rectangle of paper, the conversations |
| 16158 | tidyHomeOf | Which panel a card belongs beside, if any. |
| 16183 | tidyColumnX | The first x at or right of `x` that no panel already stands in. |
| 16201 | tidyBySession | The order cards stand in beside their panel: the panel's own order. |
| 16207 | tidyByTray | The order the inbox tray keeps: what is finished sinks to the bottom. |
| 16227 | tidyGroup | Lay one group of cards out as a column beside its panel. |
| 16288 | tidyPlan | Where the thoughts still on the paper stand, as a list of places. |
| 16331 | tidyPanelOrder | The order a tidy packs panels in: the tray first, then left to right, |
| 16353 | tidyRowWidth | How wide one row of a tidy may be, in unzoomed pixels. |
| 16378 | tidyPlaces | Where every panel stands after a tidy. |
| 16417 | settleBoardOverlap | Pack the panels the moment the board opens onto a canvas that went stale. |
| 16446 | boardPanelsOverlap | Whether two panels on this canvas stand on each other. |
| 16480 | tidyBoard | Tidy the canvas: lay the panels out as an even grid that fits the window. |
| 16544 | tidyLooseCards | Put the thoughts that are still on the paper clear of the panels. |
| 16599 | glideTidyPanels | Slide one tidy's panels to their new places, then put the cards around |
| 16653 | glideTidyBatch | Fly one tidy's cards to their places, a beat apart. |
| 16711 | openBoard | Mount the board. |
| 16760 | mountBoardInto | Build the board's parts into a root element, whichever mount owns it. |
| 17131 | boardSettingsRow | One switch in the heading's settings sheet. |
| 17178 | openBoardSettings | Open the heading's settings sheet under the chip that asked for it. |
| 17220 | closeBoardSettings | Put the heading's settings sheet away, without a repaint. |
| 17239 | unmountBoard | Unmount the board, whichever mount holds it. |
| 17364 | closeBoard | Take the floating board down, element and all. |
| 17391 | boardFieldOpen | Repaint the whole canvas from the feeds. |
| 17417 | renderBoard | } |
| 17658 | boardStatusFingerprint | The board's reading of every card's status, as one string. |
| 17679 | renderBoardOnStatus | Repaint the board for a status tick, but only if something on screen |
| 17697 | tickBoardClocks | Move the running cards' minute hands, in place. |
| 17720 | startDayTimer | Arm the one timer that watches for midnight. |
| 17735 | stopDayTimer | Stop the midnight timer: the board closed, or the page went away. |
| 17742 | startBoardClock | Start the tick that keeps the board's clocks honest. |
| 17753 | stopBoardClock | Stop the tick: the board closed, or nothing on it is running. |
| 17775 | paintHistory | Paint the "only what is marked" toggle to match the state it stands for. |
| 17790 | paintBoardStarFilter | } |
| 17807 | slotHue | One workspace on the canvas: a heading that can be dragged, and the |
| 17820 | slotSeed | Which seat a block starts on: its own id, never its name. |
| 17837 | boardSlots | Give every panel on this paint its own slice of the wheel. |
| 17872 | blockSeat | The seat one block wears: the one written down, else the one this paint gave it. |
| 17892 | goalHue | The hue one place is washed with, or null for the tray. |
| 17898 | blockInk | The colour one panel's own mark wears. |
| 17915 | noteHue | The paper one note is written on. |
| 17919 | notePaper | } |
| 17946 | noteInkOf | The ink one note is drawn in. |
| 18056 | boardIcon | One of those glyphs, at a size, as an element. |
| 18113 | boardNoteCols | How many rows an idea card's field needs for what it holds. |
| 18119 | boardTextRows | } |
| 18144 | boardEditorRows | The lines a card's field opens on. |
| 18172 | boardNoteMetrics | How much paper one idea card takes. |
| 18206 | noteParts | How much paper one idea card takes: its heading, and the lines it holds. |
| 18226 | boardCardBox | How much paper one idea card takes at rest. |
| 18252 | boardCardOpenBox | The paper a note takes while its field is up: all of its body, up to the cap. |
| 18274 | canvasPointOf | Where a point on the screen falls on the paper. |
| 18296 | raiseBoardCard | Bring one card to the front of the paper. |
| 18316 | beginNoteLift | Lift one put-away note out of the tray, under the hand. |
| 18366 | markDropGoal | Say which goal would take the card if the hand let go of it here. |
| 18385 | markDoneDrop | Light the finished strip a carried conversation would land in. |
| 18398 | boardHomeOf | The goal one conversation is drawn in on this paint, or null. |
| 18413 | boardRowOf | One conversation of this paint, by id. |
| 18429 | sendToDone | Put one conversation in the finished strip, word and all. |
| 18446 | bringBackFromDone | Take one conversation back out of the finished strip, word and all. |
| 18465 | markNoDrop | Say, under the hand, that the paper will not take this card. |
| 18491 | dropNoDropTip | Take the "the paper will not take it" line off the page. |
| 18510 | goalNodeAt | The goal panel under a native drag, asked in the order a browser answers. |
| 18522 | nearestGoal | The goal panel an element stands in, or null when it stands in none. |
| 18538 | goalUnder | The goal the pointer is standing in, as the id a card is filed under. |
| 18556 | doneBarUnder | The finished strip under the hand, or null. |
| 18585 | goalHeadKeyUnder | The goal whose heading an element stands in, as the key a card starts a |
| 18610 | boardDragHasText | Whether a native drag carries words, the one thing the shell's rows set. |
| 18648 | sessionInPayload | The words a native drag is carrying, read where the browser allows it. |
| 18675 | boardDragText | } |
| 18693 | clearBoardDragGoal | Take the goal highlight a native drag drew off the paper. |
| 18710 | onNativeDragEnd | A native drag is over, however it ended. |
| 18724 | onBoardDragOver | Say, while a native drag is over the canvas, which goal would take it. |
| 18740 | onBoardDragLeave | The native drag left the canvas: take the goal highlight with it. |
| 18760 | onBoardDrop | A conversation let go on the canvas, carried in from the host's sidebar. |
| 18787 | dropSessionOntoBoard | Take one conversation the reader dragged in, and keep it. |
| 18812 | buildSeatMenu | The twelve colours a goal can wear. |
| 18845 | pickSeat | One colour, as a press. |
| 18870 | buildGoalMenu | The verbs on a goal that are not worth a seat of their own. |
| 18893 | goalMenuItem | One line of that menu. |
| 18924 | placeGoalMenu | Stand a goal's menu under its ⋯, inside the panel's right edge. |
| 18929 | buildBoardBlock | } |
| 19346 | trayCaption | The conversations of one block, cut into threads. |
| 19361 | trayQuiet | A quiet line where a section has nothing in it yet. |
| 19379 | buildTrayNote | One note, as a line of the tray. |
| 19527 | trayInk | Ink every conversation inside one node with the tray's paper. |
| 19539 | doneBinCards | Every note put away in the finished-cards bin, newest first. |
| 19544 | doneBinCardsOf | The put-away notes one conversation was handed, newest first. |
| 19563 | openDoneBinFor | Open the bin on one conversation's own put-aways. |
| 19578 | paintDoneBin | Say how many cards the bin holds, and what it is doing. |
| 19593 | toggleDoneBin | Open or close the finished-cards list. |
| 19611 | buildDoneRow | One finished note, as a line of the card's list. |
| 19698 | mountDoneBin | Put the finished-cards list on the board, or take it away. |
| 19786 | ejectFromDoneBin | Put one card back on the paper, out of the finished-cards bin. |
| 19805 | buildInboxBody | The tray's body: the conversations nothing accounts for, and the notes put away here. |
| 19868 | buildGoalLane | The lane at the foot of one goal: what the reader did about it themselves. |
| 19894 | boardBlockColumns | How many columns a panel reads across. |
| 19910 | boardCardStacked | Whether one card is drawn inside a conversation's column. |
| 19933 | boardBlockWidth | How wide a panel stands. |
| 19957 | buildBoardColumns | A goal's conversations, laid out across the panel. |
| 19999 | buildBoardColumn | One conversation of a panel, as the column it stands in. |
| 20027 | buildDoneBar | The long strip at the foot of a goal: what the reader finished today. |
| 20106 | buildQuietStrip | The conversations a panel carried in and nobody has touched, one line each. |
| 20162 | buildQuietRow | One quiet conversation, as the line it is drawn as. |
| 20234 | buildQuietStack | The thoughts under one quiet conversation, once its count was pressed. |
| 20253 | buildBoardStack | The thoughts filed under one conversation. |
| 20319 | markCardFresh | Wear the one beat a completion is worth - once. |
| 20357 | verdictText | The word one conversation wears, in the reader's language. |
| 20374 | buildVerdictChip | What the reader said about a card, as the chip that says it. |
| 20402 | buildStateAdd | The empty seat, for a card the shell has nothing to say about. |
| 20422 | stateToggle | Open or close one card's state menu. |
| 20443 | buildVerdictMenu | The two words, and the way back to having said nothing. |
| 20463 | verdictItem | One word in that menu. |
| 20496 | clearVerdictItem | The row that takes the word back. |
| 20516 | buildBoardCard | } |
| 21010 | beginBlockRename | Start typing a goal's name into its heading. |
| 21016 | commitBlockRename | Keep the name the heading says, and close the field. |
| 21028 | cancelBlockRename | Throw the typed name away, leaving the goal as it was called. |
| 21045 | goalBaseName | The last piece of a workspace path: what the workspace is called. |
| 21058 | beginGoalIntent | Start writing what a goal is for. |
| 21073 | commitGoalIntent | Keep what the open line says, and close it. |
| 21085 | cancelGoalIntent | Throw the typed line away, leaving the goal as it was. |
| 21104 | removeBoardGoal | Take one goal off the canvas, with a few seconds to bring it back. |
| 21151 | boardNameCollisions | Which drawn cards share a name, and where each one stands in its group. |
| 21177 | boardTitleOf | The name one card wears: the reader's word while the shell catches up, |
| 21193 | noteCardTitle | Put the reader's word on a card before the shell has answered. |
| 21208 | settleTitles | Let go of the stand-in names the feed has caught up with, or outlived. |
| 21227 | beginBoardRename | Start renaming one conversation from its card. |
| 21245 | commitBoardRename | Keep what the open name field says, and rename the conversation. |
| 21284 | cancelBoardRename | Throw the open name field away, leaving the conversation as it was. |
| 21303 | forkBoardCard | Start a branch from one conversation, and draw the line when it lands. |
| 21349 | returnForkMark | Let a conversation's branch mark answer again, and say so on the card. |
| 21365 | waitForBranchRow | The catalogue row for one conversation, asked for until it arrives. |
| 21397 | settleBranchName | Give a fresh branch a name nobody else is using, and answer with it. |
| 21445 | pasteIntoComposer | Put words in the message box of the conversation on screen. |
| 21479 | composerHasText | Whether the message box already holds something. |
| 21487 | boxLength | How much text a box holds, by whichever reading it answers. |
| 21513 | writeIntoBox | Put words in a box, breaks and all. |
| 21558 | boxTakesBreak | Whether a hand-over has to start a block of its own. |
| 21579 | noteBoxWritten | Note that this plugin has just put words in a conversation's box. |
| 21601 | boxHasText | Whether one box already holds words. |
| 21616 | seatCaretAtEnd | Put the caret at the end of the box's content. |
| 21652 | seatCaretAtStart | Put the caret at the start of the box's content. |
| 21688 | commitComposerTitle | Put a title the reader just wrote at the top of the message box. |
| 21735 | flushHandoff | Put a conversation's waiting hand-over into its message box. |
| 21803 | pasteIntoBoxNow | Put words in the box that is on screen right now, if it is the right one. |
| 21837 | boxShape | TEMPORARY: one box, read small enough to keep a few of. |
| 21856 | editablesNow | TEMPORARY: every editable the page offers, read short. |
| 21883 | describeEl | TEMPORARY: what one element is, and whether it is the focused one. |
| 21900 | caretsNow | TEMPORARY: where the caret is, and whether that is inside the box. |
| 21920 | noteHandoffDiag | TEMPORARY: keep the last few hand-overs' facts. |
| 21949 | putThroughEditor | Put text into the editor the way typing would. |
| 22022 | pasteThroughEvent | Put text into the editor as a real paste event. |
| 22056 | ideaFocusCard | One card from the board's own document, by id. |
| 22076 | ideaFocusOrigin | Where a press happened, as a point the sheet can grow out of. |
| 22101 | animateIdeaFocusIn | Let the sheet grow out of the place the reader pointed at. |
| 22144 | ideaFocusSessionTitle | The name of the conversation a thought is tied to, for the sheet's foot. |
| 22165 | paintIdeaFocusDone | Keep the sheet's done box in step with the card it belongs to. |
| 22186 | cleanIdeaTitle | Keep the title on one line while letting it wrap on the paper. |
| 22194 | growIdeaTitle | Let the title field take as many lines as the words it is showing. |
| 22213 | writeIdeaFocus | Write what the sheet says into the card it belongs to. |
| 22237 | openIdeaFocus | Open one idea card, or a blank new one, in the centre of the board. |
| 22481 | closeIdeaFocus | Close the sheet, keeping what it says. |
| 22532 | deliverIdeaFocus | Hand the sheet's thought to the conversation it is tied to. |
| 22556 | buildIdeaMenu | The menu behind a thought card's ⋯. |
| 22599 | ideaMenuItem | One line of that menu. |
| 22628 | buildSessionMenu | The verbs on a conversation card that are not worth a seat of their own. |
| 22676 | placeCardMenu | One line of that menu. |
| 22693 | cardMenuItem | } |
| 22732 | buildBoardLooseCard | One loose card: a thought the reader put on the canvas rather than in a |
| 23115 | boardJoinText | Join a card's two parts back into the one string the store keeps. |
| 23134 | beginBoardCard | Start typing into one loose card - at its title, or at its body. |
| 23174 | boardTakeCardText | Keep what the open field says, and close it. |
| 23191 | commitBoardCard | } |
| 23204 | cancelBoardCard | Throw the open field away, leaving the card as it was last written. |
| 23225 | settleBoardCardForPress | Settle the open card field for a press, without the paint a settle |
| 23248 | addBoardCardAt | Open a new thought at a place, and let the sheet write it. |
| 23265 | addBoardCard | Open a new thought where the reader is looking, or below everything when |
| 23282 | removeLooseCard | Take one loose card off the canvas. |
| 23327 | removeBoardCard | Take one conversation off the board. |
| 23369 | handleOf | A press on a block's heading: the handle the panel is dragged by. |
| 23398 | beginStackedCarrier | Lift one card out of a conversation's column, where the hand is. |
| 23437 | stackCardBefore | The card a drop should sit above, from where the pointer let go. |
| 23465 | closeIdeaMenu | Mark the column the hand is over, or clear every mark. |
| 23482 | closeSeatMenu | Put the colour wheel away, without a repaint. |
| 23502 | closeGoalMenu | Put a goal's ⋯ menu away, without a repaint. |
| 23522 | closeVerdictMenu | Put a card's state menu away, without a repaint. |
| 23541 | closeSessionMenu | Put a conversation card's menu away, without a repaint. |
| 23557 | paintStackDrop | } |
| 23575 | paintHeadDrop | Light the heading of the goal a carried card would start a conversation in. |
| 23594 | parkCardOutside | Give a card lifted out of a column a place on the paper. |
| 23621 | boardPointerDown | The one press handler on the canvas. |
| 23773 | boardNoteDone | Put the drop bands on screen, or take them away. |
| 23781 | showDropZones | } |
| 23796 | boardListen | Start listening for the rest of a gesture, once it has been armed. |
| 23813 | beginSessionGrab | Start a session drag: a sort inside its own panel, a carry outside it. |
| 23831 | panelHolds | Whether a hand is still close enough to its panel to be sorting inside it. |
| 23849 | beginSessionReorder | Sort one conversation among its neighbours, where the hand is. |
| 23908 | paintSessionReorder | Follow the hand, and let the other columns make room as it passes them. |
| 23946 | sessionSlotAt | The place the hand is asking for, read off the grid. |
| 23992 | leaveSessionReorder | Hand the drag back to the carrier, because the pointer left the panel. |
| 24005 | resetSessionReorder | Put every column back where the paint left it. |
| 24031 | commitSessionReorder | Write the order the hand chose, once, and draw it. |
| 24069 | beginSessionCarrier | Give a carried card its body, where the hand is. |
| 24111 | onBoardMove | Follow the pointer: pan the paper, or carry what the hand picked up. |
| 24232 | onBoardUp | Let go: write down what the gesture decided, unless it never moved. |
| 24523 | handCardToSession | Hand one loose card's words to a conversation, and leave a trace behind. |
| 24556 | nameSessionForCard | Let the conversation a card was handed to wear the card's own name. |
| 24589 | drawCardLinks | Draw the elbow from every branch back to the conversation it was cut from. |
| 24645 | cancelBoardDrag | Drop the gesture and put back what it was carrying. |
| 24655 | endBoardDrag | Take the gesture's furniture off the page and forget it. |
| 24701 | onBoardBlurDrag | The window losing focus mid-gesture: the pointer left with it. |
| 24716 | onBoardDoubleClick | A double click on the paper: write a card right there. |
| 24768 | makeNotice | The transient line the plugin speaks in. |
| 24991 | showToast | Say one thing for a moment. A second press replaces the line and restarts |
| 24996 | hideToast | Take the notice down and drop the pending timer. |
| 25010 | SendHintLine | The line that names the send key, contributed to the shell's own dock row |
| 25075 | onComposerTitleKey | What Enter and Escape mean in the title field. |
| 25091 | ComposerTitleField | The title field itself: one line, kept uncontrolled, read on Enter. |
| 25111 | sendKeyLabel | The modifier this machine's send accelerator lives on, named the way the |
| 25130 | modelDirectories | The host's session model-selection service, when it publishes one. |
| 25146 | effortLevels | The reasoning levels one model offers, in the order the composer's own |
| 25170 | levelIndex | Where one level sits in the list. An explicit selection wins; without one |
| 25191 | currentLevelId | The level in effect for one selection, read the way the composer's own |
| 25202 | isCurrentEntry | Whether one entry is the model the conversation is already on. |
| 25220 | rowMarkedLevel | The level one picker row shows as marked, which is the level it would end |
| 25240 | rowSubmitLevel | The level one picker row would submit if it were confirmed without the |
| 25253 | refusal | A refusal this plugin can explain on its own, so the notice carries |
| 25272 | cycleEffort | One press of the reasoning key: step the visible conversation's level one |
| 25306 | stepEffort | Read the levels off one session directory and submit the next one. |
| 25356 | catalogGroups | Every provider/model the host currently advertises, for the settings page. |
| 25394 | groupsOf | The provider groups out of one loaded catalog or directory snapshot. Both |
| 25412 | offeredModels | The catalog as a lookup, one entry per `provider/model`. |
| 25450 | modelEntries | The configured models the directory currently offers, in the order the |
| 25462 | modelIndex | Where one model sits in the list; -1 when it is not one of them. |
| 25479 | modelDirectoryOfCurrent | Resolve the model directory behind the conversation on screen. |
| 25510 | readModelList | Read the list off one session directory. |
| 25554 | readNewSessionModelList | The list the sheet's model row offers. |
| 25577 | openNewSessionModelPick | Open the model window for the sheet's model row. |
| 25617 | openModelPick | One press of the model key: open the picker on the list of models the |
| 25829 | modelPickHint | The line under the picker: what it is showing, and what the keys do. |
| 25858 | renderModelPick | Repaint the picker's rows and footer from `MODELPICK.entries`. |
| 25881 | markedLevel | The level one row is currently marked with. |
| 25896 | confirmLevel | The level one confirm would submit. |
| 25919 | buildModelRow | One row of the picker: the model's name with the `current` tag in front of |
| 25974 | buildLevelCell | The levels of one model. |
| 26027 | levelClickHandler | The press handler for one level chip. |
| 26041 | keepModelPickVisible | Keep the selected row in sight when the list is longer than the card. |
| 26063 | openModelWindow | Mount the picker, with the selection already on the model in effect. |
| 26129 | closeModelPick | Unmount the picker and forget everything it was showing. |
| 26165 | moveModelPick | Move the picker's selection, wrapping at both ends. |
| 26193 | moveModelPickEntry | Put the selected model somewhere else in the list, and remember it there. |
| 26233 | reorderFavorites | Put an ordered list of pairs back into the configured one, in the new |
| 26261 | stepModelPickLevel | Step the level of the selected row, wrapping at both ends. |
| 26290 | confirmModelPick | Confirm the selected row: submit its model at its marked level, then take |
| 26355 | modelToast | The one-line notice after a switch, naming the level when the row has one. |
| 26367 | levelName | The readable name of one level of one model, or null when there is none. |
| 26389 | modelPickKeyDown | Route one keystroke to the open picker. |
| 26467 | switchModel | Read the catalog off one session directory and submit the model and level |
| 26568 | makeTranslator | Translate through the locale seat when it is wired, else through the |
| 26584 | KeyRow | One rebindable key: focus the box, press the key you want. |
| 26624 | SliderRow | One numeric preference. |
| 26654 | ChoiceRow | A short set of mutually exclusive options, as a row of toggles. Used for |
| 26700 | ModelListGroup | The switchable models as one settings group: what is chosen, in the order |
| 26893 | VimSection | The whole Settings → Vim scrolling page. |
| 27133 | BoardPage | The board as the main panel's page. |
| 27167 | BoardPanelIcon | The sidebar entry's glyph: three columns, which is what the board is. |
| 27212 | installBoardPage | Contribute the board as a sidebar entry and a main panel. |
| 27276 | overviewToday | What today did, as the overview reads it. |
| 27369 | overviewFigure | One figure: the number, and what it counts, read as one block. |
| 27387 | overviewNumber | One number in the table: how it reads depends on what it counts. |
| 27396 | overviewHeading | One heading of the table, in the same columns as its rows. |
| 27414 | mountOverviewInto | Build the overview into an element the host owns. |
| 27546 | OverviewPage | The overview as the main panel's page. |
| 27582 | OverviewPanelIcon | The sidebar entry's glyph: three bars of a day, rising to the right. |
| 27628 | installOverviewPage | Contribute the overview as a page of its own, beside the board. |
| 27685 | installWindowCSS | The rules every window this plugin mounts shares, once. |
| 27729 | installBoardCSS | Put the board's hover and motion rules on the page, once. |
| 27907 | installSettings | Contribute the settings page and its vocabulary. Both contributions are |
| 28007 | makeApi | Debug and tuning surface, also used by tools/selftest.mjs. |
| 28370 | apply | Client activation. |
