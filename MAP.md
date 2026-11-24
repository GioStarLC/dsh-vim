# MAP - src/client

由 `npm run map` 生成，不要手改。找一个功能的入口：先在这里按名字查到文件与行号，再读那一段。

源码：`src/client/`，16 个文件，523 个顶层函数。

| 文件 | 行 | 函数 | 上方注释 |
|---|---:|---|---|
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
| src/client/index.js | 90 | onSendKey | True when this keystroke is a send, and the keyboard should not stay in |
| src/client/index.js | 103 | onKeyDown | } |
| src/client/index.js | 513 | onKeyUp | Any keyup ends the hold, so a dropped keyup cannot leave the view scrolling. |
| src/client/index.js | 539 | onEscapeBlur | Escape leaves a focused composer, so the scroll keys come back. |
| src/client/index.js | 564 | onPointerMove | Remember where the pointer is. |
| src/client/index.js | 585 | forgetPointer | Forget the remembered pointer, so the focus and centre rules decide again. |
| src/client/index.js | 590 | onUserScroll | The user took over with the wheel or a touch: abandon our animation. |
| src/client/index.js | 609 | onFocusLoss | Losing the window or the tab must not leave a hold or a stale pointer |
| src/client/index.js | 3295 | applyBoardPageInk | Paint the page with the host's theme. |
| src/client/index.js | 3350 | workspaceForGoal | The workspace a new conversation started from one goal would join. |
| src/client/index.js | 3379 | boardBlockByKey | One goal of the last paint, by the key a card is filed under. |
| src/client/index.js | 3394 | onPointerDown | A press says where the keyboard should be: inside a text field it asks |
| src/client/index.js | 3419 | dismissOutsidePress | Put an open window away when the press landed beside it. |
| src/client/index.js | 3445 | pressMissesWindow | Whether a press landed outside an open window's card. |
| src/client/index.js | 3461 | activateSession | Switch the main view to one conversation. |
| src/client/index.js | 3519 | reportStoreFull | Say that the board could not be written, once. |
| src/client/index.js | 3526 | makeBoardStore | } |
| src/client/index.js | 5215 | makeHistory | The board's history: what was done, and how to put it back. |
| src/client/index.js | 5339 | makeNoteStore | The lines pinned to conversations, and the only thing that touches them. |
| src/client/index.js | 5480 | makeHistoryStore | The history's own store: one record per local day, in IndexedDB. |
| src/client/index.js | 5661 | makeJournal | The sessions a day inherited, kept where a repaint can reach them. |
| src/client/index.js | 5836 | makeCarryStore | } |
| src/client/index.js | 5931 | dayOf | The local day a moment belongs to, as `YYYY-MM-DD`. |
| src/client/index.js | 5940 | daysBetween | How many local days lie between two `YYYY-MM-DD` days. |
| src/client/index.js | 5950 | readMoment | The page the board last drew, as it was left, or null. |
| src/client/index.js | 5964 | forgetMoment | Forget the page that was left, once it has been filed. |
| src/client/index.js | 5988 | noteMoment | Remember the page this repaint draws. |
| src/client/index.js | 6012 | momentHeld | Whether the store still holds exactly the bytes this page last wrote. |
| src/client/index.js | 6031 | pageDoc | The arrangement a day's page keeps. |
| src/client/index.js | 6057 | pageView | The page as it reads, frozen. |
| src/client/index.js | 6107 | settleDay | File the page that was left, and start today. |
| src/client/index.js | 6142 | filePage | Write one page, and keep the history's size honest. |
| src/client/index.js | 6175 | settleCarry | Carry the members of the page just filed into today. |
| src/client/index.js | 6192 | pruneHistory | Keep the newest `snapshotKeepDays` pages, and no more. |
| src/client/index.js | 6210 | dropCarried | Let go of the conversations carried longest with no movement. |
| src/client/index.js | 6238 | maybeShowSeal | Show the day that just ended, once, the first time the board is up after it. |
| src/client/index.js | 6260 | sealCounts | The counts one day's summary reads off. |
| src/client/index.js | 6281 | sealLeft | What the desk still owes the reader, as of this press. |
| src/client/index.js | 6310 | paintSeal | Draw one day's summary. |
| src/client/index.js | 6386 | closeSeal | Take the day's summary down. |
| src/client/index.js | 6397 | historySearchRow | The one-line search above the days. |
| src/client/index.js | 6430 | searchHistory | Find a sentence across the pages, newest first. |
| src/client/index.js | 6472 | historyMatches | The lines of one page that carry the needle: its cards, its notes, its names. |
| src/client/index.js | 6500 | historyHitRow | One page a search found, with the lines it was found by. |
| src/client/index.js | 6538 | openBoardHistory | Open the history: the pages the board has been. |
| src/client/index.js | 6611 | closeBoardHistory | Take the history panel down, whichever page it was showing. |
| src/client/index.js | 6633 | renderHistory | Draw the list of days. |
| src/client/index.js | 6660 | historyNote | One quiet sentence where a page would be. |
| src/client/index.js | 6668 | historyMeta | How a page reads at a glance: what it was made of. |
| src/client/index.js | 6679 | historyDayRow | One day in the list, and its page once it is opened. |
| src/client/index.js | 6707 | historyDetail | One day's page, as it read: its goals, their conversations, its cards. |
| src/client/index.js | 6833 | restoreDay | Copy one page into today. |
| src/client/index.js | 6858 | applyPageOrder | Put the page's own arrangement back onto the panels. |
| src/client/index.js | 6876 | settleRestoredCarry | Seat a restored page's members as today's carried set. |
| src/client/index.js | 6890 | keepBackup | Keep what a restore or an import is about to replace. |
| src/client/index.js | 6903 | takeBeforeBackup | Take back what the last restore or import replaced. |
| src/client/index.js | 6921 | downloadJson | Hand a file to the browser. |
| src/client/index.js | 6955 | exportHistory | Write the board, its notes and every page into one file. |
| src/client/index.js | 6986 | pickHistoryFile | Ask for one file, and take it in when it arrives. |
| src/client/index.js | 7021 | importHistory | Take in one exported file. |
| src/client/index.js | 7066 | toggleBoard | The board the plugin opens when a page is not available. |
| src/client/index.js | 7079 | showBoard | } |
| src/client/index.js | 7103 | showOverview | Open the overview page: the board's own button, and the sidebar's row. |
| src/client/index.js | 7127 | pointInSelection | Whether one right press landed inside the words the reader selected. |
| src/client/index.js | 7168 | onContextMenu | The way back from a conversation: a right press on its page. |
| src/client/index.js | 7188 | beginBoardNote | Start typing the line on one card. |
| src/client/index.js | 7201 | commitBoardNote | Keep what the open field says, and close it. |
| src/client/index.js | 7216 | cancelBoardNote | Throw the open field away, leaving the card as it was. |
| src/client/index.js | 7232 | openNote | The note key: open the board on the conversation on screen, with its |
| src/client/index.js | 7269 | pinToBoard | Put one conversation on the board by hand. |
| src/client/index.js | 7295 | startOfToday | Midnight today, in the reader's own zone. |
| src/client/index.js | 7329 | goalByKey | The canvas as it is drawn: one block per workspace in play, the |
| src/client/index.js | 7355 | nextGoalName | The name a goal cut from a card starts with: the one it came from, plus |
| src/client/index.js | 7376 | cardVerdictOf | What the reader has said about a conversation, if it still applies. |
| src/client/index.js | 7394 | noteCardFinished | Write down that a turn ended, before the shell forgets it did. |
| src/client/index.js | 7414 | goalOfRow | Which goal one conversation is drawn in. |
| src/client/index.js | 7425 | boardBlocks | } |
| src/client/index.js | 7624 | rememberFork | Record a fork this plugin watched, and repaint a board that is up. |
| src/client/index.js | 7648 | inheritForkHome | File a branch in the goal its parent is in. |
| src/client/index.js | 7671 | revealBoardCard | Bring one card into view, without moving the paper any further than it |
| src/client/index.js | 7694 | watchForks | Watch the sessions service for forks, so a branch made anywhere in the |
| src/client/index.js | 7734 | boardPlaces | The places the blocks will be drawn at. |
| src/client/index.js | 7764 | firstFreeSlot | The first place on the paper no block already stands on. |
| src/client/index.js | 7796 | slotTaken | Whether a block already stands on a place. |
| src/client/index.js | 7822 | boardPanelHeights | How tall each painted panel stands, keyed by the block it is. |
| src/client/index.js | 7843 | boardPanelWidths | How wide each painted panel stands, keyed by the block it is. |
| src/client/index.js | 7869 | boardExtent | How big the stage has to be to hold everything on it. |
| src/client/index.js | 7897 | applyBoardZoom | Put the canvas's magnification on the paper. |
| src/client/index.js | 7920 | setBoardZoom | Zoom the canvas, keeping one point of it where it is on screen. |
| src/client/index.js | 7952 | fitBoardToWindow | Scale the canvas so the whole of it stands inside the window. |
| src/client/index.js | 7982 | onBoardResize | A window that changed size re-fits a canvas that was fitted to it. |
| src/client/index.js | 7992 | onBoardWheel | Ctrl/Cmd + wheel zooms the canvas, the way every canvas does. |
| src/client/index.js | 8012 | nextCardPlace | Where a new loose card goes when the reader did not point at a place. |
| src/client/index.js | 8043 | boardFreePlace | A place on the paper for a goal that was just asked for, near the eye. |
| src/client/index.js | 8086 | addBoardGoal | Stand a new goal on the canvas, ready to be given a purpose. |
| src/client/index.js | 8108 | closeNewSessionSheet | Take the new-conversation sheet down, and forget what it was writing. |
| src/client/index.js | 8133 | paintNewSessionBusy | Put the sheet's confirm button in step with the one host round trip. |
| src/client/index.js | 8149 | paintNewSessionModel | Say which model the sheet would start the conversation on. |
| src/client/index.js | 8173 | paintNewSessionField | Paint one of the sheet's fields as focused or not. |
| src/client/index.js | 8184 | watchNewSessionField | Let a field say where the caret is, for as long as it lives. |
| src/client/index.js | 8199 | openNewSessionSheet | Show the sheet that asks for a conversation's name and the words it opens with. |
| src/client/index.js | 8408 | commitNewSessionSheet | Read the sheet and start the conversation it describes. |
| src/client/index.js | 8442 | applyNewSessionModel | Put the model the sheet was set to onto the conversation just made. |
| src/client/index.js | 8484 | startNewSessionForGoal | Start one conversation under one goal, with the reader's words. |
| src/client/index.js | 8586 | tidyPanels | The panels as a tidy sees them: a rectangle of paper, the conversations |
| src/client/index.js | 8657 | tidyHomeOf | Which panel a card belongs beside, if any. |
| src/client/index.js | 8682 | tidyColumnX | The first x at or right of `x` that no panel already stands in. |
| src/client/index.js | 8700 | tidyBySession | The order cards stand in beside their panel: the panel's own order. |
| src/client/index.js | 8706 | tidyByTray | The order the inbox tray keeps: what is finished sinks to the bottom. |
| src/client/index.js | 8726 | tidyGroup | Lay one group of cards out as a column beside its panel. |
| src/client/index.js | 8787 | tidyPlan | Where the thoughts still on the paper stand, as a list of places. |
| src/client/index.js | 8828 | tidyPanelOrder | The order a tidy packs panels in: left to right, top to bottom, tray last. |
| src/client/index.js | 8850 | tidyRowWidth | How wide one row of a tidy may be, in unzoomed pixels. |
| src/client/index.js | 8875 | tidyPlaces | Where every panel stands after a tidy. |
| src/client/index.js | 8917 | tidyBoard | Tidy the canvas: put the thoughts where they belong, then lay the panels |
| src/client/index.js | 8997 | tidyLooseCards | Put the thoughts that are still on the paper clear of the panels. |
| src/client/index.js | 9049 | glideTidyPanels | Slide one tidy's panels to their new places, then put the cards around |
| src/client/index.js | 9103 | glideTidyBatch | Fly one tidy's cards to their places, a beat apart. |
| src/client/index.js | 9161 | openBoard | Mount the board. |
| src/client/index.js | 9210 | mountBoardInto | Build the board's parts into a root element, whichever mount owns it. |
| src/client/index.js | 9521 | unmountBoard | Unmount the board, whichever mount holds it. |
| src/client/index.js | 9627 | closeBoard | Take the floating board down, element and all. |
| src/client/index.js | 9654 | boardFieldOpen | Repaint the whole canvas from the feeds. |
| src/client/index.js | 9680 | renderBoard | } |
| src/client/index.js | 9903 | boardStatusFingerprint | The board's reading of every card's status, as one string. |
| src/client/index.js | 9924 | renderBoardOnStatus | Repaint the board for a status tick, but only if something on screen |
| src/client/index.js | 9939 | tickBoardClocks | Move the running cards' minute hands, in place. |
| src/client/index.js | 9962 | startDayTimer | Arm the one timer that watches for midnight. |
| src/client/index.js | 9977 | stopDayTimer | Stop the midnight timer: the board closed, or the page went away. |
| src/client/index.js | 9984 | startBoardClock | Start the tick that keeps the board's clocks honest. |
| src/client/index.js | 9995 | stopBoardClock | Stop the tick: the board closed, or nothing on it is running. |
| src/client/index.js | 10017 | paintHistory | Paint the "only what is marked" toggle to match the state it stands for. |
| src/client/index.js | 10032 | paintBoardStarFilter | } |
| src/client/index.js | 10049 | slotHue | One workspace on the canvas: a heading that can be dragged, and the |
| src/client/index.js | 10062 | slotSeed | Which seat a block starts on: its own id, never its name. |
| src/client/index.js | 10079 | boardSlots | Give every panel on this paint its own slice of the wheel. |
| src/client/index.js | 10114 | blockSeat | The seat one block wears: the one written down, else the one this paint gave it. |
| src/client/index.js | 10134 | goalHue | The hue one place is washed with, or null for the tray. |
| src/client/index.js | 10140 | blockInk | The colour one panel's own mark wears. |
| src/client/index.js | 10157 | noteHue | The paper one note is written on. |
| src/client/index.js | 10161 | notePaper | } |
| src/client/index.js | 10188 | noteInkOf | The ink one note is drawn in. |
| src/client/index.js | 10298 | boardIcon | One of those glyphs, at a size, as an element. |
| src/client/index.js | 10355 | boardNoteCols | How many rows an idea card's field needs for what it holds. |
| src/client/index.js | 10361 | boardTextRows | } |
| src/client/index.js | 10386 | boardEditorRows | The lines a card's field opens on. |
| src/client/index.js | 10414 | boardNoteMetrics | How much paper one idea card takes. |
| src/client/index.js | 10448 | noteParts | How much paper one idea card takes: its heading, and the lines it holds. |
| src/client/index.js | 10468 | boardCardBox | How much paper one idea card takes at rest. |
| src/client/index.js | 10494 | boardCardOpenBox | The paper a note takes while its field is up: all of its body, up to the cap. |
| src/client/index.js | 10516 | canvasPointOf | Where a point on the screen falls on the paper. |
| src/client/index.js | 10538 | raiseBoardCard | Bring one card to the front of the paper. |
| src/client/index.js | 10558 | beginNoteLift | Lift one put-away note out of the tray, under the hand. |
| src/client/index.js | 10608 | markDropGoal | Say which goal would take the card if the hand let go of it here. |
| src/client/index.js | 10627 | markDoneDrop | Light the finished strip a carried conversation would land in. |
| src/client/index.js | 10640 | boardHomeOf | The goal one conversation is drawn in on this paint, or null. |
| src/client/index.js | 10655 | boardRowOf | One conversation of this paint, by id. |
| src/client/index.js | 10671 | sendToDone | Put one conversation in the finished strip, word and all. |
| src/client/index.js | 10688 | bringBackFromDone | Take one conversation back out of the finished strip, word and all. |
| src/client/index.js | 10707 | markNoDrop | Say, under the hand, that the paper will not take this card. |
| src/client/index.js | 10733 | dropNoDropTip | Take the "the paper will not take it" line off the page. |
| src/client/index.js | 10752 | goalNodeAt | The goal panel under a native drag, asked in the order a browser answers. |
| src/client/index.js | 10764 | nearestGoal | The goal panel an element stands in, or null when it stands in none. |
| src/client/index.js | 10780 | goalUnder | The goal the pointer is standing in, as the id a card is filed under. |
| src/client/index.js | 10798 | doneBarUnder | The finished strip under the hand, or null. |
| src/client/index.js | 10827 | goalHeadKeyUnder | The goal whose heading an element stands in, as the key a card starts a |
| src/client/index.js | 10852 | boardDragHasText | Whether a native drag carries words, the one thing the shell's rows set. |
| src/client/index.js | 10890 | sessionInPayload | The words a native drag is carrying, read where the browser allows it. |
| src/client/index.js | 10917 | boardDragText | } |
| src/client/index.js | 10935 | clearBoardDragGoal | Take the goal highlight a native drag drew off the paper. |
| src/client/index.js | 10952 | onNativeDragEnd | A native drag is over, however it ended. |
| src/client/index.js | 10966 | onBoardDragOver | Say, while a native drag is over the canvas, which goal would take it. |
| src/client/index.js | 10982 | onBoardDragLeave | The native drag left the canvas: take the goal highlight with it. |
| src/client/index.js | 11002 | onBoardDrop | A conversation let go on the canvas, carried in from the host's sidebar. |
| src/client/index.js | 11029 | dropSessionOntoBoard | Take one conversation the reader dragged in, and keep it. |
| src/client/index.js | 11054 | buildSeatMenu | The twelve colours a goal can wear. |
| src/client/index.js | 11087 | pickSeat | One colour, as a press. |
| src/client/index.js | 11112 | buildGoalMenu | The verbs on a goal that are not worth a seat of their own. |
| src/client/index.js | 11135 | goalMenuItem | One line of that menu. |
| src/client/index.js | 11166 | placeGoalMenu | Stand a goal's menu under its ⋯, inside the panel's right edge. |
| src/client/index.js | 11171 | buildBoardBlock | } |
| src/client/index.js | 11582 | trayCaption | The conversations of one block, cut into threads. |
| src/client/index.js | 11597 | trayQuiet | A quiet line where a section has nothing in it yet. |
| src/client/index.js | 11615 | buildTrayNote | One note, as a line of the tray. |
| src/client/index.js | 11763 | trayInk | Ink every conversation inside one node with the tray's paper. |
| src/client/index.js | 11775 | doneBinCards | Every note put away in the finished-cards bin, newest first. |
| src/client/index.js | 11780 | doneBinCardsOf | The put-away notes one conversation was handed, newest first. |
| src/client/index.js | 11799 | openDoneBinFor | Open the bin on one conversation's own put-aways. |
| src/client/index.js | 11814 | paintDoneBin | Say how many cards the bin holds, and what it is doing. |
| src/client/index.js | 11829 | toggleDoneBin | Open or close the finished-cards list. |
| src/client/index.js | 11847 | buildDoneRow | One finished note, as a line of the card's list. |
| src/client/index.js | 11934 | mountDoneBin | Put the finished-cards list on the board, or take it away. |
| src/client/index.js | 12022 | ejectFromDoneBin | Put one card back on the paper, out of the finished-cards bin. |
| src/client/index.js | 12041 | buildInboxBody | The tray's body: the conversations nothing accounts for, and the notes put away here. |
| src/client/index.js | 12086 | boardBlockColumns | How many columns a panel reads across. |
| src/client/index.js | 12102 | boardCardStacked | Whether one card is drawn inside a conversation's column. |
| src/client/index.js | 12125 | boardBlockWidth | How wide a panel stands. |
| src/client/index.js | 12149 | buildBoardColumns | A goal's conversations, laid out across the panel. |
| src/client/index.js | 12191 | buildBoardColumn | One conversation of a panel, as the column it stands in. |
| src/client/index.js | 12219 | buildDoneBar | The long strip at the foot of a goal: what the reader finished today. |
| src/client/index.js | 12298 | buildQuietStrip | The conversations a panel carried in and nobody has touched, one line each. |
| src/client/index.js | 12354 | buildQuietRow | One quiet conversation, as the line it is drawn as. |
| src/client/index.js | 12426 | buildQuietStack | The thoughts under one quiet conversation, once its count was pressed. |
| src/client/index.js | 12445 | buildBoardStack | The thoughts filed under one conversation. |
| src/client/index.js | 12511 | markCardFresh | Wear the one beat a completion is worth - once. |
| src/client/index.js | 12549 | verdictText | The word one conversation wears, in the reader's language. |
| src/client/index.js | 12566 | buildVerdictChip | What the reader said about a card, as the chip that says it. |
| src/client/index.js | 12593 | buildStateAdd | The empty seat, for a card the shell has nothing to say about. |
| src/client/index.js | 12613 | stateToggle | Open or close one card's state menu. |
| src/client/index.js | 12634 | buildVerdictMenu | The two words, and the way back to having said nothing. |
| src/client/index.js | 12654 | verdictItem | One word in that menu. |
| src/client/index.js | 12687 | clearVerdictItem | The row that takes the word back. |
| src/client/index.js | 12707 | buildBoardCard | } |
| src/client/index.js | 13175 | beginBlockRename | Start typing a goal's name into its heading. |
| src/client/index.js | 13181 | commitBlockRename | Keep the name the heading says, and close the field. |
| src/client/index.js | 13193 | cancelBlockRename | Throw the typed name away, leaving the goal as it was called. |
| src/client/index.js | 13210 | goalBaseName | The last piece of a workspace path: what the workspace is called. |
| src/client/index.js | 13223 | beginGoalIntent | Start writing what a goal is for. |
| src/client/index.js | 13238 | commitGoalIntent | Keep what the open line says, and close it. |
| src/client/index.js | 13250 | cancelGoalIntent | Throw the typed line away, leaving the goal as it was. |
| src/client/index.js | 13269 | removeBoardGoal | Take one goal off the canvas, with a few seconds to bring it back. |
| src/client/index.js | 13316 | boardNameCollisions | Which drawn cards share a name, and where each one stands in its group. |
| src/client/index.js | 13342 | boardTitleOf | The name one card wears: the reader's word while the shell catches up, |
| src/client/index.js | 13358 | noteCardTitle | Put the reader's word on a card before the shell has answered. |
| src/client/index.js | 13373 | settleTitles | Let go of the stand-in names the feed has caught up with, or outlived. |
| src/client/index.js | 13392 | beginBoardRename | Start renaming one conversation from its card. |
| src/client/index.js | 13410 | commitBoardRename | Keep what the open name field says, and rename the conversation. |
| src/client/index.js | 13449 | cancelBoardRename | Throw the open name field away, leaving the conversation as it was. |
| src/client/index.js | 13468 | forkBoardCard | Start a branch from one conversation, and draw the line when it lands. |
| src/client/index.js | 13514 | returnForkMark | Let a conversation's branch mark answer again, and say so on the card. |
| src/client/index.js | 13530 | waitForBranchRow | The catalogue row for one conversation, asked for until it arrives. |
| src/client/index.js | 13562 | settleBranchName | Give a fresh branch a name nobody else is using, and answer with it. |
| src/client/index.js | 13605 | pasteIntoComposer | Put words in the message box of the conversation on screen. |
| src/client/index.js | 13639 | composerHasText | Whether the message box already holds something. |
| src/client/index.js | 13655 | boxHasText | Whether one box already holds words. |
| src/client/index.js | 13670 | seatCaretAtEnd | Put the caret at the end of the box's content. |
| src/client/index.js | 13709 | dropCardIntoComposer | Hand one loose card's words to a conversation's message box. |
| src/client/index.js | 13729 | pasteIntoBoxNow | Put the words in the box that is on screen right now, if there is one. |
| src/client/index.js | 13751 | putThroughEditor | Put text into the editor through the editing command. |
| src/client/index.js | 13770 | pasteThroughEvent | Put text into the editor as a real paste event. |
| src/client/index.js | 13796 | ideaFocusCard | One card from the board's own document, by id. |
| src/client/index.js | 13816 | ideaFocusOrigin | Where a press happened, as a point the sheet can grow out of. |
| src/client/index.js | 13841 | animateIdeaFocusIn | Let the sheet grow out of the place the reader pointed at. |
| src/client/index.js | 13884 | ideaFocusSessionTitle | The name of the conversation a thought is tied to, for the sheet's foot. |
| src/client/index.js | 13905 | paintIdeaFocusDone | Keep the sheet's done box in step with the card it belongs to. |
| src/client/index.js | 13926 | cleanIdeaTitle | Keep the title on one line while letting it wrap on the paper. |
| src/client/index.js | 13934 | growIdeaTitle | Let the title field take as many lines as the words it is showing. |
| src/client/index.js | 13953 | writeIdeaFocus | Write what the sheet says into the card it belongs to. |
| src/client/index.js | 13977 | openIdeaFocus | Open one idea card, or a blank new one, in the centre of the board. |
| src/client/index.js | 14221 | closeIdeaFocus | Close the sheet, keeping what it says. |
| src/client/index.js | 14272 | deliverIdeaFocus | Hand the sheet's thought to the conversation it is tied to. |
| src/client/index.js | 14296 | buildIdeaMenu | The menu behind a thought card's ⋯. |
| src/client/index.js | 14339 | ideaMenuItem | One line of that menu. |
| src/client/index.js | 14368 | buildSessionMenu | The verbs on a conversation card that are not worth a seat of their own. |
| src/client/index.js | 14409 | placeCardMenu | One line of that menu. |
| src/client/index.js | 14426 | cardMenuItem | } |
| src/client/index.js | 14465 | buildBoardLooseCard | One loose card: a thought the reader put on the canvas rather than in a |
| src/client/index.js | 14816 | boardJoinText | Join a card's two parts back into the one string the store keeps. |
| src/client/index.js | 14835 | beginBoardCard | Start typing into one loose card - at its title, or at its body. |
| src/client/index.js | 14875 | boardTakeCardText | Keep what the open field says, and close it. |
| src/client/index.js | 14892 | commitBoardCard | } |
| src/client/index.js | 14905 | cancelBoardCard | Throw the open field away, leaving the card as it was last written. |
| src/client/index.js | 14926 | settleBoardCardForPress | Settle the open card field for a press, without the paint a settle |
| src/client/index.js | 14949 | addBoardCardAt | Open a new thought at a place, and let the sheet write it. |
| src/client/index.js | 14966 | addBoardCard | Open a new thought where the reader is looking, or below everything when |
| src/client/index.js | 14983 | removeLooseCard | Take one loose card off the canvas. |
| src/client/index.js | 15028 | removeBoardCard | Take one conversation off the board. |
| src/client/index.js | 15070 | handleOf | A press on a block's heading: the handle the panel is dragged by. |
| src/client/index.js | 15099 | beginStackedCarrier | Lift one card out of a conversation's column, where the hand is. |
| src/client/index.js | 15138 | stackCardBefore | The card a drop should sit above, from where the pointer let go. |
| src/client/index.js | 15166 | closeIdeaMenu | Mark the column the hand is over, or clear every mark. |
| src/client/index.js | 15183 | closeSeatMenu | Put the colour wheel away, without a repaint. |
| src/client/index.js | 15203 | closeGoalMenu | Put a goal's ⋯ menu away, without a repaint. |
| src/client/index.js | 15223 | closeVerdictMenu | Put a card's state menu away, without a repaint. |
| src/client/index.js | 15242 | closeSessionMenu | Put a conversation card's menu away, without a repaint. |
| src/client/index.js | 15258 | paintStackDrop | } |
| src/client/index.js | 15276 | paintHeadDrop | Light the heading of the goal a carried card would start a conversation in. |
| src/client/index.js | 15295 | parkCardOutside | Give a card lifted out of a column a place on the paper. |
| src/client/index.js | 15322 | boardPointerDown | The one press handler on the canvas. |
| src/client/index.js | 15474 | boardNoteDone | Put the drop bands on screen, or take them away. |
| src/client/index.js | 15482 | showDropZones | } |
| src/client/index.js | 15497 | boardListen | Start listening for the rest of a gesture, once it has been armed. |
| src/client/index.js | 15514 | beginSessionGrab | Start a session drag: a sort inside its own panel, a carry outside it. |
| src/client/index.js | 15532 | panelHolds | Whether a hand is still close enough to its panel to be sorting inside it. |
| src/client/index.js | 15550 | beginSessionReorder | Sort one conversation among its neighbours, where the hand is. |
| src/client/index.js | 15609 | paintSessionReorder | Follow the hand, and let the other columns make room as it passes them. |
| src/client/index.js | 15647 | sessionSlotAt | The place the hand is asking for, read off the grid. |
| src/client/index.js | 15693 | leaveSessionReorder | Hand the drag back to the carrier, because the pointer left the panel. |
| src/client/index.js | 15706 | resetSessionReorder | Put every column back where the paint left it. |
| src/client/index.js | 15732 | commitSessionReorder | Write the order the hand chose, once, and draw it. |
| src/client/index.js | 15770 | beginSessionCarrier | Give a carried card its body, where the hand is. |
| src/client/index.js | 15812 | onBoardMove | Follow the pointer: pan the paper, or carry what the hand picked up. |
| src/client/index.js | 15933 | onBoardUp | Let go: write down what the gesture decided, unless it never moved. |
| src/client/index.js | 16211 | handCardToSession | Hand one loose card's words to a conversation, and leave a trace behind. |
| src/client/index.js | 16237 | nameSessionForCard | Let the conversation a card was handed to wear the card's own name. |
| src/client/index.js | 16267 | drawCardLinks | Draw the elbow from every branch back to the conversation it was cut from. |
| src/client/index.js | 16323 | cancelBoardDrag | Drop the gesture and put back what it was carrying. |
| src/client/index.js | 16333 | endBoardDrag | Take the gesture's furniture off the page and forget it. |
| src/client/index.js | 16379 | onBoardBlurDrag | The window losing focus mid-gesture: the pointer left with it. |
| src/client/index.js | 16394 | onBoardDoubleClick | A double click on the paper: write a card right there. |
| src/client/index.js | 16464 | SendHintLine | The line that names the send key, contributed to the shell's own dock row |
| src/client/index.js | 16496 | sendKeyLabel | The modifier this machine's send accelerator lives on, named the way the |
| src/client/index.js | 16515 | modelDirectories | The host's session model-selection service, when it publishes one. |
| src/client/index.js | 16531 | effortLevels | The reasoning levels one model offers, in the order the composer's own |
| src/client/index.js | 16555 | levelIndex | Where one level sits in the list. An explicit selection wins; without one |
| src/client/index.js | 16576 | currentLevelId | The level in effect for one selection, read the way the composer's own |
| src/client/index.js | 16587 | isCurrentEntry | Whether one entry is the model the conversation is already on. |
| src/client/index.js | 16605 | rowMarkedLevel | The level one picker row shows as marked, which is the level it would end |
| src/client/index.js | 16625 | rowSubmitLevel | The level one picker row would submit if it were confirmed without the |
| src/client/index.js | 16644 | cycleEffort | One press of the reasoning key: step the visible conversation's level one |
| src/client/index.js | 16678 | stepEffort | Read the levels off one session directory and submit the next one. |
| src/client/index.js | 16728 | catalogGroups | Every provider/model the host currently advertises, for the settings page. |
| src/client/index.js | 16766 | groupsOf | The provider groups out of one loaded catalog or directory snapshot. Both |
| src/client/index.js | 16784 | offeredModels | The catalog as a lookup, one entry per `provider/model`. |
| src/client/index.js | 16822 | modelEntries | The configured models the directory currently offers, in the order the |
| src/client/index.js | 16834 | modelIndex | Where one model sits in the list; -1 when it is not one of them. |
| src/client/index.js | 16851 | modelDirectoryOfCurrent | Resolve the model directory behind the conversation on screen. |
| src/client/index.js | 16882 | readModelList | Read the list off one session directory. |
| src/client/index.js | 16926 | readNewSessionModelList | The list the sheet's model row offers. |
| src/client/index.js | 16949 | openNewSessionModelPick | Open the model window for the sheet's model row. |
| src/client/index.js | 16989 | openModelPick | One press of the model key: open the picker on the list of models the |
| src/client/index.js | 17201 | modelPickHint | The line under the picker: what it is showing, and what the keys do. |
| src/client/index.js | 17230 | renderModelPick | Repaint the picker's rows and footer from `MODELPICK.entries`. |
| src/client/index.js | 17253 | markedLevel | The level one row is currently marked with. |
| src/client/index.js | 17268 | confirmLevel | The level one confirm would submit. |
| src/client/index.js | 17291 | buildModelRow | One row of the picker: the model's name with the `current` tag in front of |
| src/client/index.js | 17346 | buildLevelCell | The levels of one model. |
| src/client/index.js | 17399 | levelClickHandler | The press handler for one level chip. |
| src/client/index.js | 17413 | keepModelPickVisible | Keep the selected row in sight when the list is longer than the card. |
| src/client/index.js | 17435 | openModelWindow | Mount the picker, with the selection already on the model in effect. |
| src/client/index.js | 17501 | closeModelPick | Unmount the picker and forget everything it was showing. |
| src/client/index.js | 17537 | moveModelPick | Move the picker's selection, wrapping at both ends. |
| src/client/index.js | 17565 | moveModelPickEntry | Put the selected model somewhere else in the list, and remember it there. |
| src/client/index.js | 17605 | reorderFavorites | Put an ordered list of pairs back into the configured one, in the new |
| src/client/index.js | 17633 | stepModelPickLevel | Step the level of the selected row, wrapping at both ends. |
| src/client/index.js | 17662 | confirmModelPick | Confirm the selected row: submit its model at its marked level, then take |
| src/client/index.js | 17727 | modelToast | The one-line notice after a switch, naming the level when the row has one. |
| src/client/index.js | 17739 | levelName | The readable name of one level of one model, or null when there is none. |
| src/client/index.js | 17761 | modelPickKeyDown | Route one keystroke to the open picker. |
| src/client/index.js | 17839 | switchModel | Read the catalog off one session directory and submit the model and level |
| src/client/index.js | 17940 | makeTranslator | Translate through the locale seat when it is wired, else through the |
| src/client/index.js | 17956 | KeyRow | One rebindable key: focus the box, press the key you want. |
| src/client/index.js | 17996 | SliderRow | One numeric preference. |
| src/client/index.js | 18026 | ChoiceRow | A short set of mutually exclusive options, as a row of toggles. Used for |
| src/client/index.js | 18072 | ModelListGroup | The switchable models as one settings group: what is chosen, in the order |
| src/client/index.js | 18265 | VimSection | The whole Settings → Vim scrolling page. |
| src/client/index.js | 18505 | BoardPage | The board as the main panel's page. |
| src/client/index.js | 18540 | BoardPanelIcon | The sidebar entry's glyph: three columns, which is what the board is. |
| src/client/index.js | 18585 | installBoardPage | Contribute the board as a sidebar entry and a main panel. |
| src/client/index.js | 18649 | overviewToday | What today did, as the overview reads it. |
| src/client/index.js | 18742 | overviewFigure | One figure: the number, and what it counts, read as one block. |
| src/client/index.js | 18760 | overviewNumber | One number in the table: how it reads depends on what it counts. |
| src/client/index.js | 18769 | overviewHeading | One heading of the table, in the same columns as its rows. |
| src/client/index.js | 18787 | mountOverviewInto | Build the overview into an element the host owns. |
| src/client/index.js | 18919 | OverviewPage | The overview as the main panel's page. |
| src/client/index.js | 18955 | OverviewPanelIcon | The sidebar entry's glyph: three bars of a day, rising to the right. |
| src/client/index.js | 19001 | installOverviewPage | Contribute the overview as a page of its own, beside the board. |
| src/client/index.js | 19058 | installWindowCSS | The rules every window this plugin mounts shares, once. |
| src/client/index.js | 19102 | installBoardCSS | Put the board's hover and motion rules on the page, once. |
| src/client/index.js | 19278 | installSettings | Contribute the settings page and its vocabulary. Both contributions are |
| src/client/index.js | 19354 | makeApi | Debug and tuning surface, also used by tools/selftest.mjs. |
| src/client/index.js | 19700 | apply | Client activation. |
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
