# MAP - src/client

由 `npm run map` 生成，不要手改。找一个功能的入口：先在这里按名字查到文件与行号，再读那一段。

源码：`src/client/`，21 个文件，548 个顶层函数。

| 文件 | 行 | 函数 | 上方注释 |
|---|---:|---|---|
| src/client/board-css.js | 2330 | applyBoardPageInk | Paint the page with the host's theme. |
| src/client/board-css.js | 2467 | boardIcon | One of those glyphs, at a size, as an element. |
| src/client/board-css.js | 2516 | installBoardCSS | Put the board's hover and motion rules on the page, once. |
| src/client/board-stores.js | 50 | reportStoreFull | Say that the board could not be written, once. |
| src/client/board-stores.js | 57 | makeBoardStore | } |
| src/client/board-stores.js | 78 | seed | A board with nothing on it: no places, no cards, no marks. |
| src/client/board-stores.js | 126 | finite | A finite number, or null when the stored value is not one. |
| src/client/board-stores.js | 132 | positiveStamp | A positive epoch stamp, or 0 when the stored value is not one. |
| src/client/board-stores.js | 138 | firstLine | The first line of what a card says, as the journal remembers it. |
| src/client/board-stores.js | 154 | madeGoal | Whether one block id is a goal this board made itself. |
| src/client/board-stores.js | 159 | cleanMarks | The two marks and the fork lines, shared by both document versions. |
| src/client/board-stores.js | 190 | clean | Whatever was stored, reduced to a document this build can draw. |
| src/client/board-stores.js | 393 | read | The document: what is stored, else an empty canvas. |
| src/client/board-stores.js | 402 | stored | What is written under the board's key, or null when nothing readable is. |
| src/client/board-stores.js | 430 | edit | A private copy of the document, for one change to be made in. |
| src/client/board-stores.js | 446 | save | Write a document down, unless it is what was written last time. |
| src/client/board-stores.js | 471 | update | Read, let `mutate` change the document, and store it when it says so. |
| src/client/board-stores.js | 489 | seatInFamily | Seat one card at the end of the run its conversation owns. |
| src/client/board-stores.js | 1746 | makeHistory | The board's history: what was done, and how to put it back. |
| src/client/board-stores.js | 1752 | announce | Tell whoever is drawing the buttons that the stacks moved. |
| src/client/board-stores.js | 1770 | record | Register one step that has already been taken. |
| src/client/board-stores.js | 1780 | undo | Step back one command, and hold it ready to be stepped forward again. |
| src/client/board-stores.js | 1794 | redo | Step forward again, onto a command that was stepped back. |
| src/client/board-stores.js | 1870 | makeNoteStore | The lines pinned to conversations, and the only thing that touches them. |
| src/client/board-stores.js | 1875 | readAll | Whatever was stored, reduced to `id -> line` for the notes still set. |
| src/client/board-stores.js | 1895 | save | Write the map back unless it is what was written last time. |
| src/client/board-stores.js | 2005 | makeHistoryStore | The history's own store: one record per local day, in IndexedDB. |
| src/client/board-stores.js | 2014 | open | Open the database once, and answer with null when there is none to open. |
| src/client/board-stores.js | 2074 | ask | Run one request and answer with its result, or null. |
| src/client/board-stores.js | 2186 | makeJournal | The sessions a day inherited, kept where a repaint can reach them. |
| src/client/board-stores.js | 2197 | open | Open the database once, and answer with null when there is none. |
| src/client/board-stores.js | 2250 | ask | Run one request and answer with its result, or null. |
| src/client/board-stores.js | 2282 | keyFor | A key that sorts by the moment it was written, and never collides. |
| src/client/board-stores.js | 2361 | makeCarryStore | } |
| src/client/board-stores.js | 2366 | read | What is stored, reduced to `id -> {from, title, goal}`. |
| src/client/dom.js | 14 | isEditable | True when the element consumes printable characters itself. |
| src/client/dom.js | 28 | isScrollable | True when the element is a non-editable box that overflows vertically and |
| src/client/dom.js | 41 | parentOf | Parent element, crossing shadow boundaries through the host node. |
| src/client/dom.js | 52 | scrollerFrom | Nearest scrollable ancestor, inclusive. |
| src/client/dom.js | 62 | largestScroller | Largest visible scroll container; the last-resort target. |
| src/client/dom.js | 85 | elementAt | The topmost element at a point, when the document can be asked. A host |
| src/client/entry.js | 93 | watchEntries | Follow the conversation on screen for the life of the page, so an |
| src/client/entry.js | 120 | noteEntry | Start the arrival of one conversation, unless this one already had its |
| src/client/entry.js | 143 | cancelEntry | Drop the pending placement without touching what was already decided. |
| src/client/entry.js | 153 | stopEntries | Stop following arrivals; the next page arms its own watch. |
| src/client/entry.js | 178 | settleEntry | One frame of an arrival: wait until the page shows this conversation at |
| src/client/entry.js | 257 | lastInputRow | The last message a person wrote in the transcript, if one is on screen. |
| src/client/entry.js | 278 | entryScroller | The box a transcript row scrolls in: the nearest ancestor that declares |
| src/client/entry.js | 299 | anchorEntry | Put one transcript row at the top of its scrollport, within the box's |
| src/client/entry.js | 326 | settleEntryScroll | Let the shell treat the placement as a finished reading move. |
| src/client/errors.js | 18 | archiveFailureText | A reason from whatever the host rejected an archive with. |
| src/client/errors.js | 36 | failureText | A short reason from whatever the host rejected with: a remote failure |
| src/client/errors.js | 49 | refusal | A refusal this plugin can explain on its own, so the notice carries |
| src/client/focus.js | 62 | composerRoot | The message box: the rich-text editor root the shell puts the caret into. |
| src/client/focus.js | 79 | rememberComposer | Remember the element a focus landed on. It is the fallback for a host |
| src/client/focus.js | 96 | isComposerEditor | True when an element is a rich-text editor, i.e. the message box — and |
| src/client/focus.js | 112 | noteFocusRequest | Mark that the user just asked for the keyboard themselves, so the focus |
| src/client/focus.js | 131 | clearFocusRequest | Drop a request the user has just superseded by doing something else. |
| src/client/focus.js | 146 | isActivating | True for a control a bare Space activates by itself. Such a control keeps |
| src/client/focus.js | 159 | focusComposer | Put the keyboard in the message box: what the focus key is for. |
| src/client/focus.js | 184 | composerIsEmpty | True when the message box holds nothing the user put there. |
| src/client/focus.js | 207 | leaveEmptyComposer | The focus key pressed again, inside the box it put the caret in: hand the |
| src/client/focus.js | 235 | inComposer | True when a keystroke was aimed at the message box. |
| src/client/focus.js | 258 | menuOpen | True while a suggestion menu is waiting to be confirmed. |
| src/client/focus.js | 283 | doubleEnterSends | True when this Enter is the second half of a double-Enter send. |
| src/client/focus.js | 313 | sendFromComposer | Send the draft by handing the host the key it already sends with. |
| src/client/focus.js | 364 | handBackAfterSend | Give the keyboard back to the page after a send, without waiting for a |
| src/client/focus.js | 395 | breakLine | Turn a bare Enter into the host's own line break. |
| src/client/focus.js | 449 | onFocusIn | Keep the message box from taking the keyboard on its own. |
| src/client/focus.js | 475 | noteFocusReturn | Widen the licence to a focus arriving right after the window got the |
| src/client/focus.js | 487 | justReturned | Whether a focus arriving now is the tail of the window coming back. |
| src/client/index.js | 95 | onSendKey | True when this keystroke is a send, and the keyboard should not stay in |
| src/client/index.js | 108 | onKeyDown | } |
| src/client/index.js | 518 | onKeyUp | Any keyup ends the hold, so a dropped keyup cannot leave the view scrolling. |
| src/client/index.js | 544 | onEscapeBlur | Escape leaves a focused composer, so the scroll keys come back. |
| src/client/index.js | 569 | onPointerMove | Remember where the pointer is. |
| src/client/index.js | 590 | forgetPointer | Forget the remembered pointer, so the focus and centre rules decide again. |
| src/client/index.js | 595 | onUserScroll | The user took over with the wheel or a touch: abandon our animation. |
| src/client/index.js | 614 | onFocusLoss | Losing the window or the tab must not leave a hold or a stale pointer |
| src/client/index.js | 932 | workspaceForGoal | The workspace a new conversation started from one goal would join. |
| src/client/index.js | 961 | boardBlockByKey | One goal of the last paint, by the key a card is filed under. |
| src/client/index.js | 976 | onPointerDown | A press says where the keyboard should be: inside a text field it asks |
| src/client/index.js | 1001 | dismissOutsidePress | Put an open window away when the press landed beside it. |
| src/client/index.js | 1027 | pressMissesWindow | Whether a press landed outside an open window's card. |
| src/client/index.js | 1043 | activateSession | Switch the main view to one conversation. |
| src/client/index.js | 1070 | readMoment | The page the board last drew, as it was left, or null. |
| src/client/index.js | 1084 | forgetMoment | Forget the page that was left, once it has been filed. |
| src/client/index.js | 1108 | noteMoment | Remember the page this repaint draws. |
| src/client/index.js | 1132 | momentHeld | Whether the store still holds exactly the bytes this page last wrote. |
| src/client/index.js | 1151 | pageDoc | The arrangement a day's page keeps. |
| src/client/index.js | 1177 | pageView | The page as it reads, frozen. |
| src/client/index.js | 1227 | settleDay | File the page that was left, and start today. |
| src/client/index.js | 1262 | filePage | Write one page, and keep the history's size honest. |
| src/client/index.js | 1295 | settleCarry | Carry the members of the page just filed into today. |
| src/client/index.js | 1312 | pruneHistory | Keep the newest `snapshotKeepDays` pages, and no more. |
| src/client/index.js | 1330 | dropCarried | Let go of the conversations carried longest with no movement. |
| src/client/index.js | 1358 | maybeShowSeal | Show the day that just ended, once, the first time the board is up after it. |
| src/client/index.js | 1380 | sealCounts | The counts one day's summary reads off. |
| src/client/index.js | 1401 | sealLeft | What the desk still owes the reader, as of this press. |
| src/client/index.js | 1430 | paintSeal | Draw one day's summary. |
| src/client/index.js | 1506 | closeSeal | Take the day's summary down. |
| src/client/index.js | 1517 | historySearchRow | The one-line search above the days. |
| src/client/index.js | 1550 | searchHistory | Find a sentence across the pages, newest first. |
| src/client/index.js | 1592 | historyMatches | The lines of one page that carry the needle: its cards, its notes, its names. |
| src/client/index.js | 1620 | historyHitRow | One page a search found, with the lines it was found by. |
| src/client/index.js | 1658 | openBoardHistory | Open the history: the pages the board has been. |
| src/client/index.js | 1731 | closeBoardHistory | Take the history panel down, whichever page it was showing. |
| src/client/index.js | 1753 | renderHistory | Draw the list of days. |
| src/client/index.js | 1780 | historyNote | One quiet sentence where a page would be. |
| src/client/index.js | 1788 | historyMeta | How a page reads at a glance: what it was made of. |
| src/client/index.js | 1799 | historyDayRow | One day in the list, and its page once it is opened. |
| src/client/index.js | 1827 | historyDetail | One day's page, as it read: its goals, their conversations, its cards. |
| src/client/index.js | 1953 | restoreDay | Copy one page into today. |
| src/client/index.js | 1978 | applyPageOrder | Put the page's own arrangement back onto the panels. |
| src/client/index.js | 1996 | settleRestoredCarry | Seat a restored page's members as today's carried set. |
| src/client/index.js | 2010 | keepBackup | Keep what a restore or an import is about to replace. |
| src/client/index.js | 2023 | takeBeforeBackup | Take back what the last restore or import replaced. |
| src/client/index.js | 2041 | downloadJson | Hand a file to the browser. |
| src/client/index.js | 2075 | exportHistory | Write the board, its notes and every page into one file. |
| src/client/index.js | 2106 | pickHistoryFile | Ask for one file, and take it in when it arrives. |
| src/client/index.js | 2141 | importHistory | Take in one exported file. |
| src/client/index.js | 2186 | toggleBoard | The board the plugin opens when a page is not available. |
| src/client/index.js | 2199 | showBoard | } |
| src/client/index.js | 2223 | showOverview | Open the overview page: the board's own button, and the sidebar's row. |
| src/client/index.js | 2247 | pointInSelection | Whether one right press landed inside the words the reader selected. |
| src/client/index.js | 2288 | onContextMenu | The way back from a conversation: a right press on its page. |
| src/client/index.js | 2308 | beginBoardNote | Start typing the line on one card. |
| src/client/index.js | 2321 | commitBoardNote | Keep what the open field says, and close it. |
| src/client/index.js | 2336 | cancelBoardNote | Throw the open field away, leaving the card as it was. |
| src/client/index.js | 2352 | openNote | The note key: open the board on the conversation on screen, with its |
| src/client/index.js | 2389 | pinToBoard | Put one conversation on the board by hand. |
| src/client/index.js | 2435 | goalByKey | The canvas as it is drawn: one block per workspace in play, the |
| src/client/index.js | 2461 | nextGoalName | The name a goal cut from a card starts with: the one it came from, plus |
| src/client/index.js | 2482 | cardVerdictOf | What the reader has said about a conversation, if it still applies. |
| src/client/index.js | 2500 | noteCardFinished | Write down that a turn ended, before the shell forgets it did. |
| src/client/index.js | 2520 | goalOfRow | Which goal one conversation is drawn in. |
| src/client/index.js | 2531 | boardBlocks | } |
| src/client/index.js | 2730 | rememberFork | Record a fork this plugin watched, and repaint a board that is up. |
| src/client/index.js | 2754 | inheritForkHome | File a branch in the goal its parent is in. |
| src/client/index.js | 2777 | revealBoardCard | Bring one card into view, without moving the paper any further than it |
| src/client/index.js | 2800 | watchForks | Watch the sessions service for forks, so a branch made anywhere in the |
| src/client/index.js | 2840 | boardPlaces | The places the blocks will be drawn at. |
| src/client/index.js | 2870 | firstFreeSlot | The first place on the paper no block already stands on. |
| src/client/index.js | 2902 | slotTaken | Whether a block already stands on a place. |
| src/client/index.js | 2928 | boardPanelHeights | How tall each painted panel stands, keyed by the block it is. |
| src/client/index.js | 2949 | boardPanelWidths | How wide each painted panel stands, keyed by the block it is. |
| src/client/index.js | 2975 | boardExtent | How big the stage has to be to hold everything on it. |
| src/client/index.js | 3003 | applyBoardZoom | Put the canvas's magnification on the paper. |
| src/client/index.js | 3026 | setBoardZoom | Zoom the canvas, keeping one point of it where it is on screen. |
| src/client/index.js | 3058 | fitBoardToWindow | Scale the canvas so the whole of it stands inside the window. |
| src/client/index.js | 3088 | onBoardResize | A window that changed size re-fits a canvas that was fitted to it. |
| src/client/index.js | 3098 | onBoardWheel | Ctrl/Cmd + wheel zooms the canvas, the way every canvas does. |
| src/client/index.js | 3118 | nextCardPlace | Where a new loose card goes when the reader did not point at a place. |
| src/client/index.js | 3149 | boardFreePlace | A place on the paper for a goal that was just asked for, near the eye. |
| src/client/index.js | 3192 | addBoardGoal | Stand a new goal on the canvas, ready to be given a purpose. |
| src/client/index.js | 3214 | closeNewSessionSheet | Take the new-conversation sheet down, and forget what it was writing. |
| src/client/index.js | 3239 | paintNewSessionBusy | Put the sheet's confirm button in step with the one host round trip. |
| src/client/index.js | 3255 | paintNewSessionModel | Say which model the sheet would start the conversation on. |
| src/client/index.js | 3279 | paintNewSessionField | Paint one of the sheet's fields as focused or not. |
| src/client/index.js | 3290 | watchNewSessionField | Let a field say where the caret is, for as long as it lives. |
| src/client/index.js | 3305 | openNewSessionSheet | Show the sheet that asks for a conversation's name and the words it opens with. |
| src/client/index.js | 3514 | commitNewSessionSheet | Read the sheet and start the conversation it describes. |
| src/client/index.js | 3548 | applyNewSessionModel | Put the model the sheet was set to onto the conversation just made. |
| src/client/index.js | 3590 | startNewSessionForGoal | Start one conversation under one goal, with the reader's words. |
| src/client/index.js | 3692 | tidyPanels | The panels as a tidy sees them: a rectangle of paper, the conversations |
| src/client/index.js | 3763 | tidyHomeOf | Which panel a card belongs beside, if any. |
| src/client/index.js | 3788 | tidyColumnX | The first x at or right of `x` that no panel already stands in. |
| src/client/index.js | 3806 | tidyBySession | The order cards stand in beside their panel: the panel's own order. |
| src/client/index.js | 3812 | tidyByTray | The order the inbox tray keeps: what is finished sinks to the bottom. |
| src/client/index.js | 3832 | tidyGroup | Lay one group of cards out as a column beside its panel. |
| src/client/index.js | 3893 | tidyPlan | Where the thoughts still on the paper stand, as a list of places. |
| src/client/index.js | 3934 | tidyPanelOrder | The order a tidy packs panels in: left to right, top to bottom, tray last. |
| src/client/index.js | 3956 | tidyRowWidth | How wide one row of a tidy may be, in unzoomed pixels. |
| src/client/index.js | 3981 | tidyPlaces | Where every panel stands after a tidy. |
| src/client/index.js | 4023 | tidyBoard | Tidy the canvas: put the thoughts where they belong, then lay the panels |
| src/client/index.js | 4103 | tidyLooseCards | Put the thoughts that are still on the paper clear of the panels. |
| src/client/index.js | 4155 | glideTidyPanels | Slide one tidy's panels to their new places, then put the cards around |
| src/client/index.js | 4209 | glideTidyBatch | Fly one tidy's cards to their places, a beat apart. |
| src/client/index.js | 4267 | openBoard | Mount the board. |
| src/client/index.js | 4316 | mountBoardInto | Build the board's parts into a root element, whichever mount owns it. |
| src/client/index.js | 4627 | unmountBoard | Unmount the board, whichever mount holds it. |
| src/client/index.js | 4733 | closeBoard | Take the floating board down, element and all. |
| src/client/index.js | 4760 | boardFieldOpen | Repaint the whole canvas from the feeds. |
| src/client/index.js | 4786 | renderBoard | } |
| src/client/index.js | 5009 | boardStatusFingerprint | The board's reading of every card's status, as one string. |
| src/client/index.js | 5030 | renderBoardOnStatus | Repaint the board for a status tick, but only if something on screen |
| src/client/index.js | 5045 | tickBoardClocks | Move the running cards' minute hands, in place. |
| src/client/index.js | 5068 | startDayTimer | Arm the one timer that watches for midnight. |
| src/client/index.js | 5083 | stopDayTimer | Stop the midnight timer: the board closed, or the page went away. |
| src/client/index.js | 5090 | startBoardClock | Start the tick that keeps the board's clocks honest. |
| src/client/index.js | 5101 | stopBoardClock | Stop the tick: the board closed, or nothing on it is running. |
| src/client/index.js | 5123 | paintHistory | Paint the "only what is marked" toggle to match the state it stands for. |
| src/client/index.js | 5138 | paintBoardStarFilter | } |
| src/client/index.js | 5155 | slotHue | One workspace on the canvas: a heading that can be dragged, and the |
| src/client/index.js | 5168 | slotSeed | Which seat a block starts on: its own id, never its name. |
| src/client/index.js | 5185 | boardSlots | Give every panel on this paint its own slice of the wheel. |
| src/client/index.js | 5220 | blockSeat | The seat one block wears: the one written down, else the one this paint gave it. |
| src/client/index.js | 5240 | goalHue | The hue one place is washed with, or null for the tray. |
| src/client/index.js | 5246 | blockInk | The colour one panel's own mark wears. |
| src/client/index.js | 5263 | noteHue | The paper one note is written on. |
| src/client/index.js | 5267 | notePaper | } |
| src/client/index.js | 5294 | noteInkOf | The ink one note is drawn in. |
| src/client/index.js | 5330 | boardNoteCols | How many rows an idea card's field needs for what it holds. |
| src/client/index.js | 5336 | boardTextRows | } |
| src/client/index.js | 5361 | boardEditorRows | The lines a card's field opens on. |
| src/client/index.js | 5389 | boardNoteMetrics | How much paper one idea card takes. |
| src/client/index.js | 5423 | noteParts | How much paper one idea card takes: its heading, and the lines it holds. |
| src/client/index.js | 5443 | boardCardBox | How much paper one idea card takes at rest. |
| src/client/index.js | 5469 | boardCardOpenBox | The paper a note takes while its field is up: all of its body, up to the cap. |
| src/client/index.js | 5491 | canvasPointOf | Where a point on the screen falls on the paper. |
| src/client/index.js | 5513 | raiseBoardCard | Bring one card to the front of the paper. |
| src/client/index.js | 5533 | beginNoteLift | Lift one put-away note out of the tray, under the hand. |
| src/client/index.js | 5583 | markDropGoal | Say which goal would take the card if the hand let go of it here. |
| src/client/index.js | 5602 | markDoneDrop | Light the finished strip a carried conversation would land in. |
| src/client/index.js | 5615 | boardHomeOf | The goal one conversation is drawn in on this paint, or null. |
| src/client/index.js | 5630 | boardRowOf | One conversation of this paint, by id. |
| src/client/index.js | 5646 | sendToDone | Put one conversation in the finished strip, word and all. |
| src/client/index.js | 5663 | bringBackFromDone | Take one conversation back out of the finished strip, word and all. |
| src/client/index.js | 5682 | markNoDrop | Say, under the hand, that the paper will not take this card. |
| src/client/index.js | 5708 | dropNoDropTip | Take the "the paper will not take it" line off the page. |
| src/client/index.js | 5727 | goalNodeAt | The goal panel under a native drag, asked in the order a browser answers. |
| src/client/index.js | 5739 | nearestGoal | The goal panel an element stands in, or null when it stands in none. |
| src/client/index.js | 5755 | goalUnder | The goal the pointer is standing in, as the id a card is filed under. |
| src/client/index.js | 5773 | doneBarUnder | The finished strip under the hand, or null. |
| src/client/index.js | 5802 | goalHeadKeyUnder | The goal whose heading an element stands in, as the key a card starts a |
| src/client/index.js | 5827 | boardDragHasText | Whether a native drag carries words, the one thing the shell's rows set. |
| src/client/index.js | 5865 | sessionInPayload | The words a native drag is carrying, read where the browser allows it. |
| src/client/index.js | 5892 | boardDragText | } |
| src/client/index.js | 5910 | clearBoardDragGoal | Take the goal highlight a native drag drew off the paper. |
| src/client/index.js | 5927 | onNativeDragEnd | A native drag is over, however it ended. |
| src/client/index.js | 5941 | onBoardDragOver | Say, while a native drag is over the canvas, which goal would take it. |
| src/client/index.js | 5957 | onBoardDragLeave | The native drag left the canvas: take the goal highlight with it. |
| src/client/index.js | 5977 | onBoardDrop | A conversation let go on the canvas, carried in from the host's sidebar. |
| src/client/index.js | 6004 | dropSessionOntoBoard | Take one conversation the reader dragged in, and keep it. |
| src/client/index.js | 6029 | buildSeatMenu | The twelve colours a goal can wear. |
| src/client/index.js | 6062 | pickSeat | One colour, as a press. |
| src/client/index.js | 6087 | buildGoalMenu | The verbs on a goal that are not worth a seat of their own. |
| src/client/index.js | 6110 | goalMenuItem | One line of that menu. |
| src/client/index.js | 6141 | placeGoalMenu | Stand a goal's menu under its ⋯, inside the panel's right edge. |
| src/client/index.js | 6146 | buildBoardBlock | } |
| src/client/index.js | 6557 | trayCaption | The conversations of one block, cut into threads. |
| src/client/index.js | 6572 | trayQuiet | A quiet line where a section has nothing in it yet. |
| src/client/index.js | 6590 | buildTrayNote | One note, as a line of the tray. |
| src/client/index.js | 6738 | trayInk | Ink every conversation inside one node with the tray's paper. |
| src/client/index.js | 6750 | doneBinCards | Every note put away in the finished-cards bin, newest first. |
| src/client/index.js | 6755 | doneBinCardsOf | The put-away notes one conversation was handed, newest first. |
| src/client/index.js | 6774 | openDoneBinFor | Open the bin on one conversation's own put-aways. |
| src/client/index.js | 6789 | paintDoneBin | Say how many cards the bin holds, and what it is doing. |
| src/client/index.js | 6804 | toggleDoneBin | Open or close the finished-cards list. |
| src/client/index.js | 6822 | buildDoneRow | One finished note, as a line of the card's list. |
| src/client/index.js | 6909 | mountDoneBin | Put the finished-cards list on the board, or take it away. |
| src/client/index.js | 6997 | ejectFromDoneBin | Put one card back on the paper, out of the finished-cards bin. |
| src/client/index.js | 7016 | buildInboxBody | The tray's body: the conversations nothing accounts for, and the notes put away here. |
| src/client/index.js | 7061 | boardBlockColumns | How many columns a panel reads across. |
| src/client/index.js | 7077 | boardCardStacked | Whether one card is drawn inside a conversation's column. |
| src/client/index.js | 7100 | boardBlockWidth | How wide a panel stands. |
| src/client/index.js | 7124 | buildBoardColumns | A goal's conversations, laid out across the panel. |
| src/client/index.js | 7166 | buildBoardColumn | One conversation of a panel, as the column it stands in. |
| src/client/index.js | 7194 | buildDoneBar | The long strip at the foot of a goal: what the reader finished today. |
| src/client/index.js | 7273 | buildQuietStrip | The conversations a panel carried in and nobody has touched, one line each. |
| src/client/index.js | 7329 | buildQuietRow | One quiet conversation, as the line it is drawn as. |
| src/client/index.js | 7401 | buildQuietStack | The thoughts under one quiet conversation, once its count was pressed. |
| src/client/index.js | 7420 | buildBoardStack | The thoughts filed under one conversation. |
| src/client/index.js | 7486 | markCardFresh | Wear the one beat a completion is worth - once. |
| src/client/index.js | 7524 | verdictText | The word one conversation wears, in the reader's language. |
| src/client/index.js | 7541 | buildVerdictChip | What the reader said about a card, as the chip that says it. |
| src/client/index.js | 7568 | buildStateAdd | The empty seat, for a card the shell has nothing to say about. |
| src/client/index.js | 7588 | stateToggle | Open or close one card's state menu. |
| src/client/index.js | 7609 | buildVerdictMenu | The two words, and the way back to having said nothing. |
| src/client/index.js | 7629 | verdictItem | One word in that menu. |
| src/client/index.js | 7662 | clearVerdictItem | The row that takes the word back. |
| src/client/index.js | 7682 | buildBoardCard | } |
| src/client/index.js | 8150 | beginBlockRename | Start typing a goal's name into its heading. |
| src/client/index.js | 8156 | commitBlockRename | Keep the name the heading says, and close the field. |
| src/client/index.js | 8168 | cancelBlockRename | Throw the typed name away, leaving the goal as it was called. |
| src/client/index.js | 8185 | goalBaseName | The last piece of a workspace path: what the workspace is called. |
| src/client/index.js | 8198 | beginGoalIntent | Start writing what a goal is for. |
| src/client/index.js | 8213 | commitGoalIntent | Keep what the open line says, and close it. |
| src/client/index.js | 8225 | cancelGoalIntent | Throw the typed line away, leaving the goal as it was. |
| src/client/index.js | 8244 | removeBoardGoal | Take one goal off the canvas, with a few seconds to bring it back. |
| src/client/index.js | 8291 | boardNameCollisions | Which drawn cards share a name, and where each one stands in its group. |
| src/client/index.js | 8317 | boardTitleOf | The name one card wears: the reader's word while the shell catches up, |
| src/client/index.js | 8333 | noteCardTitle | Put the reader's word on a card before the shell has answered. |
| src/client/index.js | 8348 | settleTitles | Let go of the stand-in names the feed has caught up with, or outlived. |
| src/client/index.js | 8367 | beginBoardRename | Start renaming one conversation from its card. |
| src/client/index.js | 8385 | commitBoardRename | Keep what the open name field says, and rename the conversation. |
| src/client/index.js | 8424 | cancelBoardRename | Throw the open name field away, leaving the conversation as it was. |
| src/client/index.js | 8443 | forkBoardCard | Start a branch from one conversation, and draw the line when it lands. |
| src/client/index.js | 8489 | returnForkMark | Let a conversation's branch mark answer again, and say so on the card. |
| src/client/index.js | 8505 | waitForBranchRow | The catalogue row for one conversation, asked for until it arrives. |
| src/client/index.js | 8537 | settleBranchName | Give a fresh branch a name nobody else is using, and answer with it. |
| src/client/index.js | 8580 | pasteIntoComposer | Put words in the message box of the conversation on screen. |
| src/client/index.js | 8614 | composerHasText | Whether the message box already holds something. |
| src/client/index.js | 8630 | boxHasText | Whether one box already holds words. |
| src/client/index.js | 8645 | seatCaretAtEnd | Put the caret at the end of the box's content. |
| src/client/index.js | 8684 | dropCardIntoComposer | Hand one loose card's words to a conversation's message box. |
| src/client/index.js | 8704 | pasteIntoBoxNow | Put the words in the box that is on screen right now, if there is one. |
| src/client/index.js | 8726 | putThroughEditor | Put text into the editor through the editing command. |
| src/client/index.js | 8745 | pasteThroughEvent | Put text into the editor as a real paste event. |
| src/client/index.js | 8771 | ideaFocusCard | One card from the board's own document, by id. |
| src/client/index.js | 8791 | ideaFocusOrigin | Where a press happened, as a point the sheet can grow out of. |
| src/client/index.js | 8816 | animateIdeaFocusIn | Let the sheet grow out of the place the reader pointed at. |
| src/client/index.js | 8859 | ideaFocusSessionTitle | The name of the conversation a thought is tied to, for the sheet's foot. |
| src/client/index.js | 8880 | paintIdeaFocusDone | Keep the sheet's done box in step with the card it belongs to. |
| src/client/index.js | 8901 | cleanIdeaTitle | Keep the title on one line while letting it wrap on the paper. |
| src/client/index.js | 8909 | growIdeaTitle | Let the title field take as many lines as the words it is showing. |
| src/client/index.js | 8928 | writeIdeaFocus | Write what the sheet says into the card it belongs to. |
| src/client/index.js | 8952 | openIdeaFocus | Open one idea card, or a blank new one, in the centre of the board. |
| src/client/index.js | 9196 | closeIdeaFocus | Close the sheet, keeping what it says. |
| src/client/index.js | 9247 | deliverIdeaFocus | Hand the sheet's thought to the conversation it is tied to. |
| src/client/index.js | 9271 | buildIdeaMenu | The menu behind a thought card's ⋯. |
| src/client/index.js | 9314 | ideaMenuItem | One line of that menu. |
| src/client/index.js | 9343 | buildSessionMenu | The verbs on a conversation card that are not worth a seat of their own. |
| src/client/index.js | 9384 | placeCardMenu | One line of that menu. |
| src/client/index.js | 9401 | cardMenuItem | } |
| src/client/index.js | 9440 | buildBoardLooseCard | One loose card: a thought the reader put on the canvas rather than in a |
| src/client/index.js | 9791 | boardJoinText | Join a card's two parts back into the one string the store keeps. |
| src/client/index.js | 9810 | beginBoardCard | Start typing into one loose card - at its title, or at its body. |
| src/client/index.js | 9850 | boardTakeCardText | Keep what the open field says, and close it. |
| src/client/index.js | 9867 | commitBoardCard | } |
| src/client/index.js | 9880 | cancelBoardCard | Throw the open field away, leaving the card as it was last written. |
| src/client/index.js | 9901 | settleBoardCardForPress | Settle the open card field for a press, without the paint a settle |
| src/client/index.js | 9924 | addBoardCardAt | Open a new thought at a place, and let the sheet write it. |
| src/client/index.js | 9941 | addBoardCard | Open a new thought where the reader is looking, or below everything when |
| src/client/index.js | 9958 | removeLooseCard | Take one loose card off the canvas. |
| src/client/index.js | 10003 | removeBoardCard | Take one conversation off the board. |
| src/client/index.js | 10045 | handleOf | A press on a block's heading: the handle the panel is dragged by. |
| src/client/index.js | 10074 | beginStackedCarrier | Lift one card out of a conversation's column, where the hand is. |
| src/client/index.js | 10113 | stackCardBefore | The card a drop should sit above, from where the pointer let go. |
| src/client/index.js | 10141 | closeIdeaMenu | Mark the column the hand is over, or clear every mark. |
| src/client/index.js | 10158 | closeSeatMenu | Put the colour wheel away, without a repaint. |
| src/client/index.js | 10178 | closeGoalMenu | Put a goal's ⋯ menu away, without a repaint. |
| src/client/index.js | 10198 | closeVerdictMenu | Put a card's state menu away, without a repaint. |
| src/client/index.js | 10217 | closeSessionMenu | Put a conversation card's menu away, without a repaint. |
| src/client/index.js | 10233 | paintStackDrop | } |
| src/client/index.js | 10251 | paintHeadDrop | Light the heading of the goal a carried card would start a conversation in. |
| src/client/index.js | 10270 | parkCardOutside | Give a card lifted out of a column a place on the paper. |
| src/client/index.js | 10297 | boardPointerDown | The one press handler on the canvas. |
| src/client/index.js | 10449 | boardNoteDone | Put the drop bands on screen, or take them away. |
| src/client/index.js | 10457 | showDropZones | } |
| src/client/index.js | 10472 | boardListen | Start listening for the rest of a gesture, once it has been armed. |
| src/client/index.js | 10489 | beginSessionGrab | Start a session drag: a sort inside its own panel, a carry outside it. |
| src/client/index.js | 10507 | panelHolds | Whether a hand is still close enough to its panel to be sorting inside it. |
| src/client/index.js | 10525 | beginSessionReorder | Sort one conversation among its neighbours, where the hand is. |
| src/client/index.js | 10584 | paintSessionReorder | Follow the hand, and let the other columns make room as it passes them. |
| src/client/index.js | 10622 | sessionSlotAt | The place the hand is asking for, read off the grid. |
| src/client/index.js | 10668 | leaveSessionReorder | Hand the drag back to the carrier, because the pointer left the panel. |
| src/client/index.js | 10681 | resetSessionReorder | Put every column back where the paint left it. |
| src/client/index.js | 10707 | commitSessionReorder | Write the order the hand chose, once, and draw it. |
| src/client/index.js | 10745 | beginSessionCarrier | Give a carried card its body, where the hand is. |
| src/client/index.js | 10787 | onBoardMove | Follow the pointer: pan the paper, or carry what the hand picked up. |
| src/client/index.js | 10908 | onBoardUp | Let go: write down what the gesture decided, unless it never moved. |
| src/client/index.js | 11186 | handCardToSession | Hand one loose card's words to a conversation, and leave a trace behind. |
| src/client/index.js | 11212 | nameSessionForCard | Let the conversation a card was handed to wear the card's own name. |
| src/client/index.js | 11242 | drawCardLinks | Draw the elbow from every branch back to the conversation it was cut from. |
| src/client/index.js | 11298 | cancelBoardDrag | Drop the gesture and put back what it was carrying. |
| src/client/index.js | 11308 | endBoardDrag | Take the gesture's furniture off the page and forget it. |
| src/client/index.js | 11354 | onBoardBlurDrag | The window losing focus mid-gesture: the pointer left with it. |
| src/client/index.js | 11369 | onBoardDoubleClick | A double click on the paper: write a card right there. |
| src/client/index.js | 11439 | SendHintLine | The line that names the send key, contributed to the shell's own dock row |
| src/client/index.js | 11471 | sendKeyLabel | The modifier this machine's send accelerator lives on, named the way the |
| src/client/index.js | 11566 | makeTranslator | Translate through the locale seat when it is wired, else through the |
| src/client/index.js | 11582 | KeyRow | One rebindable key: focus the box, press the key you want. |
| src/client/index.js | 11622 | SliderRow | One numeric preference. |
| src/client/index.js | 11652 | ChoiceRow | A short set of mutually exclusive options, as a row of toggles. Used for |
| src/client/index.js | 11698 | ModelListGroup | The switchable models as one settings group: what is chosen, in the order |
| src/client/index.js | 11891 | VimSection | The whole Settings → Vim scrolling page. |
| src/client/index.js | 12131 | BoardPage | The board as the main panel's page. |
| src/client/index.js | 12166 | BoardPanelIcon | The sidebar entry's glyph: three columns, which is what the board is. |
| src/client/index.js | 12211 | installBoardPage | Contribute the board as a sidebar entry and a main panel. |
| src/client/index.js | 12275 | overviewToday | What today did, as the overview reads it. |
| src/client/index.js | 12368 | overviewFigure | One figure: the number, and what it counts, read as one block. |
| src/client/index.js | 12386 | overviewNumber | One number in the table: how it reads depends on what it counts. |
| src/client/index.js | 12395 | overviewHeading | One heading of the table, in the same columns as its rows. |
| src/client/index.js | 12413 | mountOverviewInto | Build the overview into an element the host owns. |
| src/client/index.js | 12545 | OverviewPage | The overview as the main panel's page. |
| src/client/index.js | 12581 | OverviewPanelIcon | The sidebar entry's glyph: three bars of a day, rising to the right. |
| src/client/index.js | 12627 | installOverviewPage | Contribute the overview as a page of its own, beside the board. |
| src/client/index.js | 12684 | installWindowCSS | The rules every window this plugin mounts shares, once. |
| src/client/index.js | 12721 | installSettings | Contribute the settings page and its vocabulary. Both contributions are |
| src/client/index.js | 12797 | makeApi | Debug and tuning surface, also used by tools/selftest.mjs. |
| src/client/index.js | 13143 | apply | Client activation. |
| src/client/model-picker.js | 118 | openNewSessionModelPick | Open the model window for the sheet's model row. |
| src/client/model-picker.js | 158 | openModelPick | One press of the model key: open the picker on the list of models the |
| src/client/model-picker.js | 370 | modelPickHint | The line under the picker: what it is showing, and what the keys do. |
| src/client/model-picker.js | 399 | renderModelPick | Repaint the picker's rows and footer from `MODELPICK.entries`. |
| src/client/model-picker.js | 423 | markedLevel | The level one row is currently marked with. |
| src/client/model-picker.js | 438 | confirmLevel | The level one confirm would submit. |
| src/client/model-picker.js | 461 | buildModelRow | One row of the picker: the model's name with the `current` tag in front of |
| src/client/model-picker.js | 516 | buildLevelCell | The levels of one model. |
| src/client/model-picker.js | 569 | levelClickHandler | The press handler for one level chip. |
| src/client/model-picker.js | 583 | keepModelPickVisible | Keep the selected row in sight when the list is longer than the card. |
| src/client/model-picker.js | 605 | openModelWindow | Mount the picker, with the selection already on the model in effect. |
| src/client/model-picker.js | 671 | closeModelPick | Unmount the picker and forget everything it was showing. |
| src/client/model-picker.js | 707 | moveModelPick | Move the picker's selection, wrapping at both ends. |
| src/client/model-picker.js | 735 | moveModelPickEntry | Put the selected model somewhere else in the list, and remember it there. |
| src/client/model-picker.js | 775 | reorderFavorites | Put an ordered list of pairs back into the configured one, in the new |
| src/client/model-picker.js | 803 | stepModelPickLevel | Step the level of the selected row, wrapping at both ends. |
| src/client/model-picker.js | 832 | confirmModelPick | Confirm the selected row: submit its model at its marked level, then take |
| src/client/model-picker.js | 899 | modelToast | The one-line notice after a switch, naming the level when the row has one. |
| src/client/model-picker.js | 921 | modelPickKeyDown | Route one keystroke to the open picker. |
| src/client/models.js | 7 | isCurrentEntry | Whether one catalog row is the model currently in effect. |
| src/client/models.js | 31 | modelDirectories | The host's session model-selection service, when it publishes one. |
| src/client/models.js | 47 | effortLevels | The reasoning levels one model offers, in the order the composer's own |
| src/client/models.js | 71 | levelIndex | Where one level sits in the list. An explicit selection wins; without one |
| src/client/models.js | 92 | currentLevelId | The level in effect for one selection, read the way the composer's own |
| src/client/models.js | 116 | rowMarkedLevel | The level one picker row shows as marked, which is the level it would end |
| src/client/models.js | 136 | rowSubmitLevel | The level one picker row would submit if it were confirmed without the |
| src/client/models.js | 155 | cycleEffort | One press of the reasoning key: step the visible conversation's level one |
| src/client/models.js | 189 | stepEffort | Read the levels off one session directory and submit the next one. |
| src/client/models.js | 238 | offeredModels | The catalog as a lookup, one entry per `provider/model`. |
| src/client/models.js | 276 | modelEntries | The configured models the directory currently offers, in the order the |
| src/client/models.js | 288 | modelIndex | Where one model sits in the list; -1 when it is not one of them. |
| src/client/models.js | 305 | modelDirectoryOfCurrent | Resolve the model directory behind the conversation on screen. |
| src/client/models.js | 336 | readModelList | Read the list off one session directory. |
| src/client/models.js | 380 | readNewSessionModelList | The list the sheet's model row offers. |
| src/client/models.js | 401 | levelName | The readable name of one level of one model, or null when there is none. |
| src/client/models.js | 421 | switchModel | Read the catalog off one session directory and submit the model and level |
| src/client/models.js | 450 | catalogGroups | Whether one entry is the model the conversation is already on. |
| src/client/models.js | 488 | groupsOf | The provider groups out of one loaded catalog or directory snapshot. Both |
| src/client/phases.js | 34 | makePhaseLedger | The ledger behind `PHASES_MODEL`, and the only thing that touches the |
| src/client/phases.js | 41 | persist | Write the map back; a storage failure is not fatal. |
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
| src/client/runs.js | 41 | makeRunLedger | The ledger behind `RUNS`, and the only thing that touches it. |
| src/client/runs.js | 54 | persist | Write the ledger back, so the next page can pick it up where this one left it. |
| src/client/runs.js | 240 | noteDeliveries | Note the turn ends: a conversation this page watched run, no longer running. |
| src/client/runs.js | 266 | syncRuns | } |
| src/client/runs.js | 283 | watchRuns | Follow the status source for the life of the page, so a turn is stamped |
| src/client/runs.js | 306 | loadRunStamps | Read the stamps the previous page left behind, dropping the ones that are |
| src/client/runs.js | 314 | forgetRuns | Stop watching, and forget every stamp the watch had taken. |
| src/client/runs.js | 323 | runSince | The moment the turn in flight in one conversation was seen to start. |
| src/client/runs.js | 339 | elapsedText | How long a turn has been in flight, at minute resolution. |
| src/client/runs.js | 372 | attentionOf | Which attention block a conversation belongs to, or null for the plain |
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
| src/client/session-actions.js | 21 | renameSession | Rename one conversation, the way the shell's own sidebar does it: retain |
| src/client/session-actions.js | 29 | finish | var settled = false |
| src/client/session-actions.js | 71 | archiveSession | Archive the selected conversation, through the host's own action. |
| src/client/session-actions.js | 79 | finish | var settled = false |
| src/client/sessions.js | 30 | serviceOf | One host service, however this context publishes it. These two are read |
| src/client/sessions.js | 49 | taskServices | The session feed, the workspace registry, and the workspace navigator. |
| src/client/sessions.js | 78 | statusFor | The shell's unified status entry for one conversation, if it publishes one. |
| src/client/sessions.js | 95 | currentSession | The conversation on screen, as the shell's own shortcuts see it: the one |
| src/client/sessions.js | 115 | currentSessionRunning | True when the conversation on screen has a turn in flight. |
| src/client/sessions.js | 138 | entryRunning | Whether the conversation still has a turn in flight, or null while the |
| src/client/sessions.js | 156 | statusOf | What one conversation is doing right now, as a short label. |
| src/client/sessions.js | 177 | statusIsLive | True for the statuses that mean a turn is in flight: one that is running, |
| src/client/sessions.js | 201 | conversationPool | Every conversation worth offering, newest first. |
| src/client/sessions.js | 248 | sortByRecency | Sort rows by recency, newest first, with the id as a deterministic |
| src/client/sessions.js | 267 | hereIndex | Where the conversation on screen sits in a list, or 0 when it is not |
| src/client/sessions.js | 288 | folderIndex | Which folder each conversation lives in, as `{ label, path }` keyed by |
| src/client/sessions.js | 325 | folderById | One workspace, by the id the board files its goals under. |
| src/client/sessions.js | 352 | folderLabel | What a folder reads as on a row: the Workspace's own title, else the last |
| src/client/strings.js | 775 | localeIsZh | Best-effort locale guess, used for the nav label and fallback strings. |
| src/client/strings.js | 781 | paletteText | Built-in string for the task window; it is plugin chrome, not shell copy. |
| src/client/task-window.js | 79 | requestTurns | Queue a turn count for every drawn row that does not have one yet. The |
| src/client/task-window.js | 89 | turnCountLanded | A count landed: the rows are stale, and the next queued slot may open. |
| src/client/task-window.js | 96 | cancelPeeks | Drop every queued and in-flight turn read. |
| src/client/task-window.js | 113 | setStage | Mark one conversation, or take the mark off it, and repaint. |
| src/client/task-window.js | 130 | stageHandler | The press handler for one stage word on one row. |
| src/client/task-window.js | 147 | cyclePhase | Advance one conversation to the next stage, and repaint the window. |
| src/client/task-window.js | 575 | sizePanel | Fit the panel to the configured size. |
| src/client/task-window.js | 588 | placementMargin | How far the panel is held off the edge it is parked against. |
| src/client/task-window.js | 600 | placePanel | Park the panel according to the configured position. The one place that |
| src/client/task-window.js | 629 | tickClocks | Repaint the live chips, in place. |
| src/client/task-window.js | 659 | clockDelay | Milliseconds until the next whole minute of the oldest clock given. |
| src/client/task-window.js | 670 | startClock | Start the tick that keeps the clocks on screen honest. |
| src/client/task-window.js | 681 | stopClock | Stop the tick: the window closed, or nothing on screen is running. |
| src/client/task-window.js | 719 | donePulseAmount | How far into the beat `progress` (0..1) is, as a 0..1 swell. |
| src/client/task-window.js | 733 | paintDonePulse | Paint the beat on every "just finished" chip on screen. |
| src/client/task-window.js | 749 | tickDonePulse | One frame of the beat; schedules the next, or puts the chips back. |
| src/client/task-window.js | 773 | startDonePulse | Start the beat, unless there is nothing to point at or the OS asked for |
| src/client/task-window.js | 781 | stopDonePulse | Cancel the beat and put every chip it touched back. |
| src/client/task-window.js | 796 | relativeTime | Coarse "how long ago" for a row. Deliberately four buckets, so a list |
| src/client/task-window.js | 807 | paletteHint | Footer hint, rebuilt from the live bindings and the current depth. |
| src/client/task-window.js | 866 | paletteHeadline | The one line above the list: what is on the reader's plate right now. |
| src/client/task-window.js | 893 | firstOwedIndex | Where the selection opens: the first thing waiting on the reader, else |
| src/client/task-window.js | 939 | paletteBlocks | Split the pool into the attention blocks and the browsing blocks. |
| src/client/task-window.js | 1015 | waitedSince | How long a conversation has been waiting on the reader, as a stamp. |
| src/client/task-window.js | 1034 | revealMore | Reveal one more batch of older conversations. |
| src/client/task-window.js | 1079 | paletteSections | The blocks to draw, in order, each with its header. |
| src/client/task-window.js | 1118 | rebuildRows | Rebuild `rows` and `sections` from the two blocks. |
| src/client/task-window.js | 1154 | rowColumns | The row grid: the state chip, the name, and the metadata — tag, stage, |
| src/client/task-window.js | 1174 | columnOf | The grid column one cell belongs to, on this repaint. |
| src/client/task-window.js | 1187 | widestCell | The widest content width among one column's cells. |
| src/client/task-window.js | 1213 | fitColumns | Give every row the same tracks, sized to what is actually on screen. |
| src/client/task-window.js | 1245 | namesOwnFolder | Whether a row in this block has to name its own folder. |
| src/client/task-window.js | 1257 | buildRow | One list row. Clicking it switches, so the window is not keyboard-only. |
| src/client/task-window.js | 1441 | buildRenameInput | The name box that replaces a row's title while it is being renamed. |
| src/client/task-window.js | 1476 | focusRename | Put the caret in the name box, with the whole name selected the first time |
| src/client/task-window.js | 1500 | beginRename | Start renaming the selected conversation. |
| src/client/task-window.js | 1509 | cancelRename | Drop the edit and repaint the row as it was. |
| src/client/task-window.js | 1523 | commitRename | Hand the typed name to the host. |
| src/client/task-window.js | 1559 | archiveSelected | Archive the selected row, with the footer saying what happened. |
| src/client/task-window.js | 1580 | setPaletteNotice | Say something in the footer. The next repaint restores the hint, so a |
| src/client/task-window.js | 1595 | resetPaintScratch | Put this repaint's measurements away, ready for the next one. |
| src/client/task-window.js | 1611 | renderPalette | Repaint the list from `PALETTE.sections`; cheap enough at this size. |
| src/client/task-window.js | 1682 | moreReachable | Whether the "More" seat has anything left to give. |
| src/client/task-window.js | 1699 | buildSectionHeader | One block heading. It is not selectable and not a row: it names the block |
| src/client/task-window.js | 1743 | scrollSelectionIntoView | Keep the cursor visible when the list is longer than the panel. |
| src/client/task-window.js | 1757 | moreHeadingNode | The "More" heading element currently on screen, or null. |
| src/client/task-window.js | 1783 | refreshPalette | Re-read both feeds, holding the selection on the same conversation and |
| src/client/task-window.js | 1829 | selectedRow | The conversation under the cursor, or null when the cursor is standing on |
| src/client/task-window.js | 1845 | moreSeatAt | Where the "More" seat stands in the row order, as a row index. |
| src/client/task-window.js | 1868 | moveSelection | Move the selection, wrapping at both ends. |
| src/client/task-window.js | 1912 | activateSelection | Act on whatever the selection is standing on. |
| src/client/task-window.js | 1924 | openPalette | Mount the window and read the feed. Rolling state is torn down first: |
| src/client/task-window.js | 2036 | closePalette | Unmount the window and drop every feed subscription. |
| src/client/task-window.js | 2096 | paletteKeyDown | Route one keystroke to the open window. |
| src/client/time.js | 9 | dayOf | The local day a moment belongs to, as `YYYY-MM-DD`. |
| src/client/time.js | 18 | daysBetween | How many local days lie between two `YYYY-MM-DD` days. |
| src/client/time.js | 35 | startOfToday | Midnight today, in the reader's own zone. |
| src/client/toast.js | 38 | makeNotice | The transient line the plugin speaks in. |
| src/client/toast.js | 46 | hideNow | Take the notice off the page and drop the pending timer. |
| src/client/toast.js | 221 | showToast | Say one thing for a moment. A second press replaces the line and restarts |
| src/client/toast.js | 226 | hideToast | Take the notice down and drop the pending timer. |
| src/client/turns.js | 37 | makeTurnPeek | The ledger behind `TURNS`, and the only thing that touches it. |
| src/client/turns.js | 119 | turnsOf | The turn count already peeked for a conversation, or null. |
| src/client/turns.js | 132 | requestTurns | Queue a turn count for every loaded row that does not have one yet. |
| src/client/turns.js | 145 | drainPeeks | Start as many queued peeks as the concurrency budget allows. |
| src/client/turns.js | 160 | peekTurns | Read one session's `sessionStats.turns` and let go of it again. |
| src/client/turns.js | 166 | finish | var timer = null |
| src/client/turns.js | 205 | accept | var face = projections.faceOf('sessionStats') |
| src/client/turns.js | 229 | cancelPeeks | Drop every queued and in-flight peek; the window closed or unloaded. |
