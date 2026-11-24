# MAP - src/client

由 `npm run map` 生成，不要手改。找一个功能的入口：先在这里按名字查到文件与行号，再读那一段。

源码：`src/client/`，35 个文件，621 个顶层函数。

| 文件 | 行 | 函数 | 上方注释 |
|---|---:|---|---|
| src/client/activation.js | 36 | makeApi | import { BOARD_CARRY_DROP_DAYS } from './constants.js' |
| src/client/activation.js | 395 | apply | } |
| src/client/app-actions.js | 26 | activateSession | Switch the main view to one conversation. |
| src/client/app-actions.js | 57 | toggleBoard | The board the plugin opens when a page is not available. |
| src/client/app-actions.js | 70 | showBoard | } |
| src/client/app-actions.js | 94 | showOverview | Open the overview page: the board's own button, and the sidebar's row. |
| src/client/board-canvas.js | 31 | workspaceForGoal | The workspace a new conversation started from one goal would join. |
| src/client/board-canvas.js | 60 | boardBlockByKey | One goal of the last paint, by the key a card is filed under. |
| src/client/board-canvas.js | 92 | goalByKey | The canvas as it is drawn: one block per workspace in play, the |
| src/client/board-canvas.js | 118 | nextGoalName | The name a goal cut from a card starts with: the one it came from, plus |
| src/client/board-canvas.js | 141 | goalOfRow | Which goal one conversation is drawn in. |
| src/client/board-canvas.js | 152 | boardBlocks | } |
| src/client/board-canvas.js | 364 | boardPlaces | The places the blocks will be drawn at. |
| src/client/board-canvas.js | 394 | firstFreeSlot | The first place on the paper no block already stands on. |
| src/client/board-canvas.js | 426 | slotTaken | Whether a block already stands on a place. |
| src/client/board-canvas.js | 452 | boardPanelHeights | How tall each painted panel stands, keyed by the block it is. |
| src/client/board-canvas.js | 473 | boardPanelWidths | How wide each painted panel stands, keyed by the block it is. |
| src/client/board-canvas.js | 499 | boardExtent | How big the stage has to be to hold everything on it. |
| src/client/board-canvas.js | 529 | applyBoardZoom | Put the canvas's magnification on the paper. |
| src/client/board-canvas.js | 552 | setBoardZoom | Zoom the canvas, keeping one point of it where it is on screen. |
| src/client/board-canvas.js | 584 | fitBoardToWindow | Scale the canvas so the whole of it stands inside the window. |
| src/client/board-canvas.js | 614 | onBoardResize | A window that changed size re-fits a canvas that was fitted to it. |
| src/client/board-canvas.js | 624 | onBoardWheel | Ctrl/Cmd + wheel zooms the canvas, the way every canvas does. |
| src/client/board-canvas.js | 644 | nextCardPlace | Where a new loose card goes when the reader did not point at a place. |
| src/client/board-canvas.js | 675 | boardFreePlace | A place on the paper for a goal that was just asked for, near the eye. |
| src/client/board-canvas.js | 717 | tidyPanels | The panels as a tidy sees them: a rectangle of paper, the conversations |
| src/client/board-canvas.js | 788 | tidyHomeOf | Which panel a card belongs beside, if any. |
| src/client/board-canvas.js | 813 | tidyColumnX | The first x at or right of `x` that no panel already stands in. |
| src/client/board-canvas.js | 831 | tidyBySession | The order cards stand in beside their panel: the panel's own order. |
| src/client/board-canvas.js | 837 | tidyByTray | The order the inbox tray keeps: what is finished sinks to the bottom. |
| src/client/board-canvas.js | 857 | tidyGroup | Lay one group of cards out as a column beside its panel. |
| src/client/board-canvas.js | 918 | tidyPlan | Where the thoughts still on the paper stand, as a list of places. |
| src/client/board-canvas.js | 961 | tidyPanelOrder | The order a tidy packs panels in: the tray first, then left to right, |
| src/client/board-canvas.js | 983 | tidyRowWidth | How wide one row of a tidy may be, in unzoomed pixels. |
| src/client/board-canvas.js | 1008 | tidyPlaces | Where every panel stands after a tidy. |
| src/client/board-canvas.js | 1047 | settleBoardOverlap | Pack the panels the moment the board opens onto a canvas that went stale. |
| src/client/board-canvas.js | 1076 | boardPanelsOverlap | Whether two panels on this canvas stand on each other. |
| src/client/board-canvas.js | 1110 | tidyBoard | Tidy the canvas: lay the panels out as an even grid that fits the window. |
| src/client/board-canvas.js | 1174 | tidyLooseCards | Put the thoughts that are still on the paper clear of the panels. |
| src/client/board-canvas.js | 1229 | glideTidyPanels | Slide one tidy's panels to their new places, then put the cards around |
| src/client/board-canvas.js | 1232 | settle | var started = 0 |
| src/client/board-canvas.js | 1247 | step | } |
| src/client/board-canvas.js | 1283 | glideTidyBatch | Fly one tidy's cards to their places, a beat apart. |
| src/client/board-canvas.js | 1298 | settle | } |
| src/client/board-canvas.js | 1305 | step | } |
| src/client/board-canvas.js | 1344 | slotHue | One workspace on the canvas: a heading that can be dragged, and the |
| src/client/board-canvas.js | 1357 | slotSeed | Which seat a block starts on: its own id, never its name. |
| src/client/board-canvas.js | 1374 | boardSlots | Give every panel on this paint its own slice of the wheel. |
| src/client/board-canvas.js | 1409 | blockSeat | The seat one block wears: the one written down, else the one this paint gave it. |
| src/client/board-canvas.js | 1429 | goalHue | The hue one place is washed with, or null for the tray. |
| src/client/board-canvas.js | 1435 | blockInk | The colour one panel's own mark wears. |
| src/client/board-canvas.js | 1452 | noteHue | The paper one note is written on. |
| src/client/board-canvas.js | 1456 | notePaper | } |
| src/client/board-canvas.js | 1483 | noteInkOf | The ink one note is drawn in. |
| src/client/board-canvas.js | 1519 | boardNoteCols | How many rows an idea card's field needs for what it holds. |
| src/client/board-canvas.js | 1525 | boardTextRows | } |
| src/client/board-canvas.js | 1550 | boardEditorRows | The lines a card's field opens on. |
| src/client/board-canvas.js | 1578 | boardNoteMetrics | How much paper one idea card takes. |
| src/client/board-canvas.js | 1612 | noteParts | How much paper one idea card takes: its heading, and the lines it holds. |
| src/client/board-canvas.js | 1632 | boardCardBox | How much paper one idea card takes at rest. |
| src/client/board-canvas.js | 1658 | boardCardOpenBox | The paper a note takes while its field is up: all of its body, up to the cap. |
| src/client/board-canvas.js | 1680 | canvasPointOf | Where a point on the screen falls on the paper. |
| src/client/board-canvas.js | 1696 | boardHomeOf | The goal one conversation is drawn in on this paint, or null. |
| src/client/board-canvas.js | 1711 | boardRowOf | One conversation of this paint, by id. |
| src/client/board-canvas.js | 1730 | goalNodeAt | The goal panel under a native drag, asked in the order a browser answers. |
| src/client/board-canvas.js | 1742 | nearestGoal | The goal panel an element stands in, or null when it stands in none. |
| src/client/board-canvas.js | 1758 | goalUnder | The goal the pointer is standing in, as the id a card is filed under. |
| src/client/board-canvas.js | 1776 | doneBarUnder | The finished strip under the hand, or null. |
| src/client/board-canvas.js | 1805 | goalHeadKeyUnder | The goal whose heading an element stands in, as the key a card starts a |
| src/client/board-canvas.js | 1825 | boardBlockColumns | How many columns a panel reads across. |
| src/client/board-canvas.js | 1841 | boardCardStacked | Whether one card is drawn inside a conversation's column. |
| src/client/board-canvas.js | 1864 | boardBlockWidth | How wide a panel stands. |
| src/client/board-canvas.js | 1882 | boardJoinText | Join a card's two parts back into the one string the store keeps. |
| src/client/board-canvas.js | 1901 | parkCardOutside | Give a card lifted out of a column a place on the paper. |
| src/client/board-css.js | 116 | solidPaper | The canvas's own chrome. |
| src/client/board-css.js | 2669 | applyBoardPageInk | Paint the page with the host's theme. |
| src/client/board-css.js | 2807 | boardIcon | One of those glyphs, at a size, as an element. |
| src/client/board-css.js | 2856 | installBoardCSS | Put the board's hover and motion rules on the page, once. |
| src/client/board-gestures.js | 32 | beginNoteLift | Lift one put-away note out of the tray, under the hand. |
| src/client/board-gestures.js | 82 | markDropGoal | Say which goal would take the card if the hand let go of it here. |
| src/client/board-gestures.js | 101 | markDoneDrop | Light the finished strip a carried conversation would land in. |
| src/client/board-gestures.js | 121 | markNoDrop | Say, under the hand, that the paper will not take this card. |
| src/client/board-gestures.js | 147 | dropNoDropTip | Take the "the paper will not take it" line off the page. |
| src/client/board-gestures.js | 164 | boardDragHasText | Whether a native drag carries words, the one thing the shell's rows set. |
| src/client/board-gestures.js | 202 | sessionInPayload | The words a native drag is carrying, read where the browser allows it. |
| src/client/board-gestures.js | 229 | boardDragText | } |
| src/client/board-gestures.js | 247 | clearBoardDragGoal | Take the goal highlight a native drag drew off the paper. |
| src/client/board-gestures.js | 264 | onNativeDragEnd | A native drag is over, however it ended. |
| src/client/board-gestures.js | 278 | onBoardDragOver | Say, while a native drag is over the canvas, which goal would take it. |
| src/client/board-gestures.js | 294 | onBoardDragLeave | The native drag left the canvas: take the goal highlight with it. |
| src/client/board-gestures.js | 314 | onBoardDrop | A conversation let go on the canvas, carried in from the host's sidebar. |
| src/client/board-gestures.js | 341 | dropSessionOntoBoard | Take one conversation the reader dragged in, and keep it. |
| src/client/board-gestures.js | 377 | handleOf | A press on a block's heading: the handle the panel is dragged by. |
| src/client/board-gestures.js | 406 | beginStackedCarrier | Lift one card out of a conversation's column, where the hand is. |
| src/client/board-gestures.js | 445 | stackCardBefore | The card a drop should sit above, from where the pointer let go. |
| src/client/board-gestures.js | 459 | paintStackDrop | } |
| src/client/board-gestures.js | 477 | paintHeadDrop | Light the heading of the goal a carried card would start a conversation in. |
| src/client/board-gestures.js | 498 | boardPointerDown | The one press handler on the canvas. |
| src/client/board-gestures.js | 640 | showDropZones | } |
| src/client/board-gestures.js | 655 | boardListen | Start listening for the rest of a gesture, once it has been armed. |
| src/client/board-gestures.js | 672 | beginSessionGrab | Start a session drag: a sort inside its own panel, a carry outside it. |
| src/client/board-gestures.js | 690 | panelHolds | Whether a hand is still close enough to its panel to be sorting inside it. |
| src/client/board-gestures.js | 708 | beginSessionReorder | Sort one conversation among its neighbours, where the hand is. |
| src/client/board-gestures.js | 767 | paintSessionReorder | Follow the hand, and let the other columns make room as it passes them. |
| src/client/board-gestures.js | 805 | sessionSlotAt | The place the hand is asking for, read off the grid. |
| src/client/board-gestures.js | 851 | leaveSessionReorder | Hand the drag back to the carrier, because the pointer left the panel. |
| src/client/board-gestures.js | 864 | resetSessionReorder | Put every column back where the paint left it. |
| src/client/board-gestures.js | 890 | commitSessionReorder | Write the order the hand chose, once, and draw it. |
| src/client/board-gestures.js | 928 | beginSessionCarrier | Give a carried card its body, where the hand is. |
| src/client/board-gestures.js | 968 | onBoardMove | Follow the pointer: pan the paper, or carry what the hand picked up. |
| src/client/board-gestures.js | 1089 | onBoardUp | Let go: write down what the gesture decided, unless it never moved. |
| src/client/board-gestures.js | 1382 | drawCardLinks | Draw the elbow from every branch back to the conversation it was cut from. |
| src/client/board-gestures.js | 1438 | cancelBoardDrag | Drop the gesture and put back what it was carrying. |
| src/client/board-gestures.js | 1448 | endBoardDrag | Take the gesture's furniture off the page and forget it. |
| src/client/board-gestures.js | 1494 | onBoardBlurDrag | The window losing focus mid-gesture: the pointer left with it. |
| src/client/board-gestures.js | 1509 | onBoardDoubleClick | A double click on the paper: write a card right there. |
| src/client/board-history.js | 42 | readMoment | The page the board last drew, as it was left, or null. |
| src/client/board-history.js | 56 | forgetMoment | Forget the page that was left, once it has been filed. |
| src/client/board-history.js | 80 | noteMoment | Remember the page this repaint draws. |
| src/client/board-history.js | 104 | momentHeld | Whether the store still holds exactly the bytes this page last wrote. |
| src/client/board-history.js | 123 | pageDoc | The arrangement a day's page keeps. |
| src/client/board-history.js | 149 | pageView | The page as it reads, frozen. |
| src/client/board-history.js | 209 | settleDay | File the page that was left, and start today. |
| src/client/board-history.js | 244 | filePage | Write one page, and keep the history's size honest. |
| src/client/board-history.js | 277 | settleCarry | Carry the members of the page just filed into today. |
| src/client/board-history.js | 294 | pruneHistory | Keep the newest `snapshotKeepDays` pages, and no more. |
| src/client/board-history.js | 312 | dropCarried | Let go of the conversations carried longest with no movement. |
| src/client/board-history.js | 340 | maybeShowSeal | Show the day that just ended, once, the first time the board is up after it. |
| src/client/board-history.js | 362 | sealCounts | The counts one day's summary reads off. |
| src/client/board-history.js | 383 | sealLeft | What the desk still owes the reader, as of this press. |
| src/client/board-history.js | 412 | paintSeal | Draw one day's summary. |
| src/client/board-history.js | 431 | counted | One counted line, and the words under it when it has any. |
| src/client/board-history.js | 488 | closeSeal | Take the day's summary down. |
| src/client/board-history.js | 499 | historySearchRow | The one-line search above the days. |
| src/client/board-history.js | 532 | searchHistory | Find a sentence across the pages, newest first. |
| src/client/board-history.js | 574 | historyMatches | The lines of one page that carry the needle: its cards, its notes, its names. |
| src/client/board-history.js | 602 | historyHitRow | One page a search found, with the lines it was found by. |
| src/client/board-history.js | 640 | openBoardHistory | Open the history: a calendar of the pages the board has been. |
| src/client/board-history.js | 665 | tool | One word in the tools row. |
| src/client/board-history.js | 720 | closeBoardHistory | Take the calendar down. |
| src/client/board-history.js | 740 | renderHistory | Draw the calendar. |
| src/client/board-history.js | 764 | historyNote | One quiet sentence where a page would be. |
| src/client/board-history.js | 772 | historyMeta | How a page reads at a glance: what it was made of. |
| src/client/board-history.js | 783 | monthOf | The month a `YYYY-MM-DD` day belongs to, or '' when it is not a day. |
| src/client/board-history.js | 788 | addMonths | One month, stepped by whole months, as `YYYY-MM`. |
| src/client/board-history.js | 800 | historyMonthLabel | How a month reads: the reader's own words, not a timestamp. |
| src/client/board-history.js | 817 | historyCalendar | The month grid: every day the board has a page for, one cell each. |
| src/client/board-history.js | 864 | historyCalendarHead | The month between the two steps, which are only presses when they lead somewhere. |
| src/client/board-history.js | 869 | step | One step, live only when there is a month on that side of this one. |
| src/client/board-history.js | 911 | historyCalendarCell | One day in the calendar. |
| src/client/board-history.js | 957 | viewDay | Stand the canvas on one past day. |
| src/client/board-history.js | 980 | backToToday | Put the canvas back on today. |
| src/client/board-history.js | 1002 | paintBoardActions | Show the heading's working chips, or put them away. |
| src/client/board-history.js | 1021 | paintHistoryPage | Draw one past day on the canvas. |
| src/client/board-history.js | 1102 | historyBlocks | A page's goals, with their conversations put back under them. |
| src/client/board-history.js | 1133 | historyPlaces | Where each of a page's panels stood, keyed by block. |
| src/client/board-history.js | 1152 | historyCardPlaces | Where each of a page's thoughts stood, or where an older page's thoughts |
| src/client/board-history.js | 1185 | buildHistoryBlock | One panel of a page: the same box as today's, with nothing in it that can |
| src/client/board-history.js | 1250 | buildHistoryRow | One conversation of a page: the name and the word it wore. |
| src/client/board-history.js | 1289 | historyChipStyle | The chip a status word wore: the same three colours the live canvas uses. |
| src/client/board-history.js | 1304 | buildHistoryCard | One thought of a page: the words, on the paper they were written on. |
| src/client/board-history.js | 1332 | paintHistoryBanner | The bar a page wears: the day, what it is, and the presses that belong to it. |
| src/client/board-history.js | 1418 | removeHistoryBanner | Take a page's bar down. |
| src/client/board-history.js | 1434 | restoreDay | Copy one page into today. |
| src/client/board-history.js | 1459 | applyPageOrder | Put the page's own arrangement back onto the panels. |
| src/client/board-history.js | 1477 | settleRestoredCarry | Seat a restored page's members as today's carried set. |
| src/client/board-history.js | 1491 | keepBackup | Keep what a restore or an import is about to replace. |
| src/client/board-history.js | 1504 | takeBeforeBackup | Take back what the last restore or import replaced. |
| src/client/board-history.js | 1522 | downloadJson | Hand a file to the browser. |
| src/client/board-history.js | 1556 | exportHistory | Write the board, its notes and every page into one file. |
| src/client/board-history.js | 1587 | pickHistoryFile | Ask for one file, and take it in when it arrives. |
| src/client/board-history.js | 1622 | importHistory | Take in one exported file. |
| src/client/board-mount.js | 39 | openBoard | Mount the board. |
| src/client/board-mount.js | 88 | mountBoardInto | Build the board's parts into a root element, whichever mount owns it. |
| src/client/board-mount.js | 459 | boardSettingsRow | One switch in the heading's settings sheet. |
| src/client/board-mount.js | 475 | paint | words.appendChild(hint) |
| src/client/board-mount.js | 506 | openBoardSettings | Open the heading's settings sheet under the chip that asked for it. |
| src/client/board-mount.js | 548 | closeBoardSettings | Put the heading's settings sheet away, without a repaint. |
| src/client/board-mount.js | 567 | unmountBoard | Unmount the board, whichever mount holds it. |
| src/client/board-mount.js | 692 | closeBoard | Take the floating board down, element and all. |
| src/client/board-notes.js | 23 | beginBoardNote | Start typing the line on one card. |
| src/client/board-notes.js | 36 | commitBoardNote | Keep what the open field says, and close it. |
| src/client/board-notes.js | 51 | cancelBoardNote | Throw the open field away, leaving the card as it was. |
| src/client/board-notes.js | 67 | openNote | The note key: open the board on the conversation on screen, with its |
| src/client/board-notes.js | 104 | pinToBoard | Put one conversation on the board by hand. |
| src/client/board-notes.js | 134 | cardVerdictOf | What the reader has said about a conversation, if it still applies. |
| src/client/board-notes.js | 152 | noteCardFinished | Write down that a turn ended, before the shell forgets it did. |
| src/client/board-notes.js | 168 | rememberFork | Record a fork this plugin watched, and repaint a board that is up. |
| src/client/board-notes.js | 192 | inheritForkHome | File a branch in the goal its parent is in. |
| src/client/board-notes.js | 215 | revealBoardCard | Bring one card into view, without moving the paper any further than it |
| src/client/board-notes.js | 238 | watchForks | Watch the sessions service for forks, so a branch made anywhere in the |
| src/client/board-notes.js | 277 | addBoardGoal | Stand a new goal on the canvas, ready to be given a purpose. |
| src/client/board-pages.js | 32 | BoardPage | The board as the main panel's page. |
| src/client/board-pages.js | 66 | BoardPanelIcon | The sidebar entry's glyph: three columns, which is what the board is. |
| src/client/board-pages.js | 111 | installBoardPage | Contribute the board as a sidebar entry and a main panel. |
| src/client/board-pages.js | 175 | overviewToday | What today did, as the overview reads it. |
| src/client/board-pages.js | 268 | overviewFigure | One figure: the number, and what it counts, read as one block. |
| src/client/board-pages.js | 286 | overviewNumber | One number in the table: how it reads depends on what it counts. |
| src/client/board-pages.js | 295 | overviewHeading | One heading of the table, in the same columns as its rows. |
| src/client/board-pages.js | 313 | mountOverviewInto | Build the overview into an element the host owns. |
| src/client/board-pages.js | 445 | OverviewPage | The overview as the main panel's page. |
| src/client/board-pages.js | 481 | OverviewPanelIcon | The sidebar entry's glyph: three bars of a day, rising to the right. |
| src/client/board-pages.js | 527 | installOverviewPage | Contribute the overview as a page of its own, beside the board. |
| src/client/board-pages.js | 584 | installWindowCSS | The rules every window this plugin mounts shares, once. |
| src/client/board-sheet.js | 27 | closeNewSessionSheet | Take the new-conversation sheet down, and forget what it was writing. |
| src/client/board-sheet.js | 52 | paintNewSessionBusy | Put the sheet's confirm button in step with the one host round trip. |
| src/client/board-sheet.js | 68 | paintNewSessionModel | Say which model the sheet would start the conversation on. |
| src/client/board-sheet.js | 92 | paintNewSessionField | Paint one of the sheet's fields as focused or not. |
| src/client/board-sheet.js | 103 | watchNewSessionField | Let a field say where the caret is, for as long as it lives. |
| src/client/board-sheet.js | 118 | openNewSessionSheet | Show the sheet that asks for a conversation's name and the words it opens with. |
| src/client/board-sheet.js | 327 | commitNewSessionSheet | Read the sheet and start the conversation it describes. |
| src/client/board-sheet.js | 361 | applyNewSessionModel | Put the model the sheet was set to onto the conversation just made. |
| src/client/board-sheet.js | 409 | startNewSessionForGoal | Start one conversation under one goal, with the reader's words. |
| src/client/board-sheet.js | 438 | fail | var sessionId = '' |
| src/client/board-state.js | 317 | boardTitleOf | The name one card wears: the reader's word while the shell catches up, |
| src/client/board-state.js | 340 | boardFieldOpen | Repaint the whole canvas from the feeds. |
| src/client/board-state.js | 377 | raiseBoardCard | Bring one card to the front of the paper. |
| src/client/board-stores.js | 50 | reportStoreFull | Say that the board could not be written, once. |
| src/client/board-stores.js | 57 | makeBoardStore | } |
| src/client/board-stores.js | 78 | seed | A board with nothing on it: no places, no cards, no marks. |
| src/client/board-stores.js | 126 | finite | A finite number, or null when the stored value is not one. |
| src/client/board-stores.js | 132 | positiveStamp | A positive epoch stamp, or 0 when the stored value is not one. |
| src/client/board-stores.js | 138 | firstLine | The first line of what a card says, as the journal remembers it. |
| src/client/board-stores.js | 154 | madeGoal | Whether one block id is a goal this board made itself. |
| src/client/board-stores.js | 159 | cleanMarks | The two marks and the fork lines, shared by both document versions. |
| src/client/board-stores.js | 190 | clean | Whatever was stored, reduced to a document this build can draw. |
| src/client/board-stores.js | 395 | read | The document: what is stored, else an empty canvas. |
| src/client/board-stores.js | 404 | stored | What is written under the board's key, or null when nothing readable is. |
| src/client/board-stores.js | 432 | edit | A private copy of the document, for one change to be made in. |
| src/client/board-stores.js | 448 | save | Write a document down, unless it is what was written last time. |
| src/client/board-stores.js | 473 | update | Read, let `mutate` change the document, and store it when it says so. |
| src/client/board-stores.js | 491 | seatInFamily | Seat one card at the end of the run its conversation owns. |
| src/client/board-stores.js | 1775 | makeHistory | The board's history: what was done, and how to put it back. |
| src/client/board-stores.js | 1781 | announce | Tell whoever is drawing the buttons that the stacks moved. |
| src/client/board-stores.js | 1799 | record | Register one step that has already been taken. |
| src/client/board-stores.js | 1809 | undo | Step back one command, and hold it ready to be stepped forward again. |
| src/client/board-stores.js | 1823 | redo | Step forward again, onto a command that was stepped back. |
| src/client/board-stores.js | 1899 | makeNoteStore | The lines pinned to conversations, and the only thing that touches them. |
| src/client/board-stores.js | 1904 | readAll | Whatever was stored, reduced to `id -> line` for the notes still set. |
| src/client/board-stores.js | 1924 | save | Write the map back unless it is what was written last time. |
| src/client/board-stores.js | 2012 | makeHandoffStore | The words handed to a conversation the board was not standing in. |
| src/client/board-stores.js | 2020 | readAll | Whatever was stored, reduced to session id -> words for live queues. |
| src/client/board-stores.js | 2046 | save | Write the queues back unless they are what was written last time. |
| src/client/board-stores.js | 2146 | makeHistoryStore | The history's own store: one record per local day, in IndexedDB. |
| src/client/board-stores.js | 2155 | open | Open the database once, and answer with null when there is none to open. |
| src/client/board-stores.js | 2215 | ask | Run one request and answer with its result, or null. |
| src/client/board-stores.js | 2327 | makeJournal | The sessions a day inherited, kept where a repaint can reach them. |
| src/client/board-stores.js | 2338 | open | Open the database once, and answer with null when there is none. |
| src/client/board-stores.js | 2391 | ask | Run one request and answer with its result, or null. |
| src/client/board-stores.js | 2423 | keyFor | A key that sorts by the moment it was written, and never collides. |
| src/client/board-stores.js | 2502 | makeCarryStore | } |
| src/client/board-stores.js | 2507 | read | What is stored, reduced to `id -> {from, title, goal}`. |
| src/client/board-view.js | 29 | renderBoard | import { SAID, drainSaid, peekSaid, promptOf, wantSaidFor } from './turns.js' |
| src/client/board-view.js | 270 | boardStatusFingerprint | The board's reading of every card's status, as one string. |
| src/client/board-view.js | 291 | renderBoardOnStatus | Repaint the board for a status tick, but only if something on screen |
| src/client/board-view.js | 309 | tickBoardClocks | Move the running cards' minute hands, in place. |
| src/client/board-view.js | 332 | startDayTimer | Arm the one timer that watches for midnight. |
| src/client/board-view.js | 347 | stopDayTimer | Stop the midnight timer: the board closed, or the page went away. |
| src/client/board-view.js | 354 | startBoardClock | Start the tick that keeps the board's clocks honest. |
| src/client/board-view.js | 365 | stopBoardClock | Stop the tick: the board closed, or nothing on it is running. |
| src/client/board-view.js | 387 | paintHistory | Paint the "only what is marked" toggle to match the state it stands for. |
| src/client/board-view.js | 402 | paintBoardStarFilter | } |
| src/client/board-view.js | 416 | sendToDone | Put one conversation in the finished strip, word and all. |
| src/client/board-view.js | 433 | bringBackFromDone | Take one conversation back out of the finished strip, word and all. |
| src/client/board-view.js | 449 | buildSeatMenu | The twelve colours a goal can wear. |
| src/client/board-view.js | 482 | pickSeat | One colour, as a press. |
| src/client/board-view.js | 507 | buildGoalMenu | The verbs on a goal that are not worth a seat of their own. |
| src/client/board-view.js | 530 | goalMenuItem | One line of that menu. |
| src/client/board-view.js | 561 | placeGoalMenu | Stand a goal's menu under its ⋯, inside the panel's right edge. |
| src/client/board-view.js | 566 | buildBoardBlock | } |
| src/client/board-view.js | 983 | trayCaption | The conversations of one block, cut into threads. |
| src/client/board-view.js | 998 | trayQuiet | A quiet line where a section has nothing in it yet. |
| src/client/board-view.js | 1016 | buildTrayNote | One note, as a line of the tray. |
| src/client/board-view.js | 1164 | trayInk | Ink every conversation inside one node with the tray's paper. |
| src/client/board-view.js | 1176 | doneBinCards | Every note put away in the finished-cards bin, newest first. |
| src/client/board-view.js | 1181 | doneBinCardsOf | The put-away notes one conversation was handed, newest first. |
| src/client/board-view.js | 1200 | openDoneBinFor | Open the bin on one conversation's own put-aways. |
| src/client/board-view.js | 1215 | paintDoneBin | Say how many cards the bin holds, and what it is doing. |
| src/client/board-view.js | 1230 | toggleDoneBin | Open or close the finished-cards list. |
| src/client/board-view.js | 1248 | buildDoneRow | One finished note, as a line of the card's list. |
| src/client/board-view.js | 1335 | mountDoneBin | Put the finished-cards list on the board, or take it away. |
| src/client/board-view.js | 1423 | ejectFromDoneBin | Put one card back on the paper, out of the finished-cards bin. |
| src/client/board-view.js | 1442 | buildInboxBody | The tray's body: the conversations nothing accounts for, and the notes put away here. |
| src/client/board-view.js | 1505 | buildGoalLane | The lane at the foot of one goal: what the reader did about it themselves. |
| src/client/board-view.js | 1543 | buildBoardColumns | A goal's conversations, laid out across the panel. |
| src/client/board-view.js | 1585 | buildBoardColumn | One conversation of a panel, as the column it stands in. |
| src/client/board-view.js | 1613 | buildDoneBar | The long strip at the foot of a goal: what the reader finished today. |
| src/client/board-view.js | 1692 | buildQuietStrip | The conversations a panel carried in and nobody has touched, one line each. |
| src/client/board-view.js | 1748 | buildQuietRow | One quiet conversation, as the line it is drawn as. |
| src/client/board-view.js | 1820 | buildQuietStack | The thoughts under one quiet conversation, once its count was pressed. |
| src/client/board-view.js | 1839 | buildBoardStack | The thoughts filed under one conversation. |
| src/client/board-view.js | 1905 | markCardFresh | Wear the one beat a completion is worth - once. |
| src/client/board-view.js | 1943 | verdictText | The word one conversation wears, in the reader's language. |
| src/client/board-view.js | 1960 | buildVerdictChip | What the reader said about a card, as the chip that says it. |
| src/client/board-view.js | 1988 | buildStateAdd | The empty seat, for a card the shell has nothing to say about. |
| src/client/board-view.js | 2008 | stateToggle | Open or close one card's state menu. |
| src/client/board-view.js | 2029 | buildVerdictMenu | The two words, and the way back to having said nothing. |
| src/client/board-view.js | 2049 | verdictItem | One word in that menu. |
| src/client/board-view.js | 2082 | clearVerdictItem | The row that takes the word back. |
| src/client/board-view.js | 2102 | buildBoardCard | } |
| src/client/board-view.js | 2169 | railSeat | Put one mark in the next seat, or leave the seat empty. |
| src/client/board-view.js | 2596 | beginBlockRename | Start typing a goal's name into its heading. |
| src/client/board-view.js | 2602 | commitBlockRename | Keep the name the heading says, and close the field. |
| src/client/board-view.js | 2614 | cancelBlockRename | Throw the typed name away, leaving the goal as it was called. |
| src/client/board-view.js | 2631 | goalBaseName | The last piece of a workspace path: what the workspace is called. |
| src/client/board-view.js | 2644 | beginGoalIntent | Start writing what a goal is for. |
| src/client/board-view.js | 2659 | commitGoalIntent | Keep what the open line says, and close it. |
| src/client/board-view.js | 2671 | cancelGoalIntent | Throw the typed line away, leaving the goal as it was. |
| src/client/board-view.js | 2690 | removeBoardGoal | Take one goal off the canvas, with a few seconds to bring it back. |
| src/client/board-view.js | 2737 | boardNameCollisions | Which drawn cards share a name, and where each one stands in its group. |
| src/client/board-view.js | 2767 | noteCardTitle | Put the reader's word on a card before the shell has answered. |
| src/client/board-view.js | 2782 | settleTitles | Let go of the stand-in names the feed has caught up with, or outlived. |
| src/client/board-view.js | 2801 | beginBoardRename | Start renaming one conversation from its card. |
| src/client/board-view.js | 2819 | commitBoardRename | Keep what the open name field says, and rename the conversation. |
| src/client/board-view.js | 2858 | cancelBoardRename | Throw the open name field away, leaving the conversation as it was. |
| src/client/board-view.js | 2877 | forkBoardCard | Start a branch from one conversation, and draw the line when it lands. |
| src/client/board-view.js | 2923 | returnForkMark | Let a conversation's branch mark answer again, and say so on the card. |
| src/client/board-view.js | 2939 | waitForBranchRow | The catalogue row for one conversation, asked for until it arrives. |
| src/client/board-view.js | 2971 | settleBranchName | Give a fresh branch a name nobody else is using, and answer with it. |
| src/client/board-view.js | 3019 | pasteIntoComposer | Put words in the message box of the conversation on screen. |
| src/client/board-view.js | 3024 | putInBox | putInBox() |
| src/client/board-view.js | 3053 | composerHasText | Whether the message box already holds something. |
| src/client/board-view.js | 3061 | boxLength | How much text a box holds, by whichever reading it answers. |
| src/client/board-view.js | 3087 | writeIntoBox | Put words in a box, breaks and all. |
| src/client/board-view.js | 3132 | boxTakesBreak | Whether a hand-over has to start a block of its own. |
| src/client/board-view.js | 3153 | noteBoxWritten | Note that this plugin has just put words in a conversation's box. |
| src/client/board-view.js | 3175 | boxHasText | Whether one box already holds words. |
| src/client/board-view.js | 3190 | seatCaretAtEnd | Put the caret at the end of the box's content. |
| src/client/board-view.js | 3226 | seatCaretAtStart | Put the caret at the start of the box's content. |
| src/client/board-view.js | 3262 | commitComposerTitle | Put a title the reader just wrote at the top of the message box. |
| src/client/board-view.js | 3309 | flushHandoff | Put a conversation's waiting hand-over into its message box. |
| src/client/board-view.js | 3327 | settle | Every ending goes through here: the words landed, or they are still |
| src/client/board-view.js | 3377 | pasteIntoBoxNow | Put words in the box that is on screen right now, if it is the right one. |
| src/client/board-view.js | 3411 | boxShape | TEMPORARY: one box, read small enough to keep a few of. |
| src/client/board-view.js | 3430 | editablesNow | TEMPORARY: every editable the page offers, read short. |
| src/client/board-view.js | 3457 | describeEl | TEMPORARY: what one element is, and whether it is the focused one. |
| src/client/board-view.js | 3474 | caretsNow | TEMPORARY: where the caret is, and whether that is inside the box. |
| src/client/board-view.js | 3494 | noteHandoffDiag | TEMPORARY: keep the last few hand-overs' facts. |
| src/client/board-view.js | 3523 | putThroughEditor | Put text into the editor the way typing would. |
| src/client/board-view.js | 3528 | typeLine | Type one line, and say whether the editor took it. |
| src/client/board-view.js | 3596 | pasteThroughEvent | Put text into the editor as a real paste event. |
| src/client/board-view.js | 3630 | ideaFocusCard | One card from the board's own document, by id. |
| src/client/board-view.js | 3650 | ideaFocusOrigin | Where a press happened, as a point the sheet can grow out of. |
| src/client/board-view.js | 3675 | animateIdeaFocusIn | Let the sheet grow out of the place the reader pointed at. |
| src/client/board-view.js | 3690 | step | var started = 0 |
| src/client/board-view.js | 3718 | ideaFocusSessionTitle | The name of the conversation a thought is tied to, for the sheet's foot. |
| src/client/board-view.js | 3739 | paintIdeaFocusDone | Keep the sheet's done box in step with the card it belongs to. |
| src/client/board-view.js | 3760 | cleanIdeaTitle | Keep the title on one line while letting it wrap on the paper. |
| src/client/board-view.js | 3768 | growIdeaTitle | Let the title field take as many lines as the words it is showing. |
| src/client/board-view.js | 3787 | writeIdeaFocus | Write what the sheet says into the card it belongs to. |
| src/client/board-view.js | 3811 | openIdeaFocus | Open one idea card, or a blank new one, in the centre of the board. |
| src/client/board-view.js | 4055 | closeIdeaFocus | Close the sheet, keeping what it says. |
| src/client/board-view.js | 4106 | deliverIdeaFocus | Hand the sheet's thought to the conversation it is tied to. |
| src/client/board-view.js | 4130 | buildIdeaMenu | The menu behind a thought card's ⋯. |
| src/client/board-view.js | 4173 | ideaMenuItem | One line of that menu. |
| src/client/board-view.js | 4202 | buildSessionMenu | The verbs on a conversation card that are not worth a seat of their own. |
| src/client/board-view.js | 4250 | placeCardMenu | One line of that menu. |
| src/client/board-view.js | 4267 | cardMenuItem | } |
| src/client/board-view.js | 4306 | buildBoardLooseCard | One loose card: a thought the reader put on the canvas rather than in a |
| src/client/board-view.js | 4688 | beginBoardCard | Start typing into one loose card - at its title, or at its body. |
| src/client/board-view.js | 4728 | boardTakeCardText | Keep what the open field says, and close it. |
| src/client/board-view.js | 4745 | commitBoardCard | } |
| src/client/board-view.js | 4758 | cancelBoardCard | Throw the open field away, leaving the card as it was last written. |
| src/client/board-view.js | 4779 | settleBoardCardForPress | Settle the open card field for a press, without the paint a settle |
| src/client/board-view.js | 4802 | addBoardCardAt | Open a new thought at a place, and let the sheet write it. |
| src/client/board-view.js | 4819 | addBoardCard | Open a new thought where the reader is looking, or below everything when |
| src/client/board-view.js | 4836 | removeLooseCard | Take one loose card off the canvas. |
| src/client/board-view.js | 4881 | removeBoardCard | Take one conversation off the board. |
| src/client/board-view.js | 4915 | closeIdeaMenu | Mark the column the hand is over, or clear every mark. |
| src/client/board-view.js | 4932 | closeSeatMenu | Put the colour wheel away, without a repaint. |
| src/client/board-view.js | 4952 | closeGoalMenu | Put a goal's ⋯ menu away, without a repaint. |
| src/client/board-view.js | 4972 | closeVerdictMenu | Put a card's state menu away, without a repaint. |
| src/client/board-view.js | 4991 | closeSessionMenu | Put a conversation card's menu away, without a repaint. |
| src/client/board-view.js | 5017 | boardNoteDone | Put the drop bands on screen, or take them away. |
| src/client/board-view.js | 5038 | handCardToSession | Hand one loose card's words to a conversation, and leave a trace behind. |
| src/client/board-view.js | 5071 | nameSessionForCard | Let the conversation a card was handed to wear the card's own name. |
| src/client/board-view.js | 5097 | boardSettleEdits | Commit whatever is being typed on the canvas before a day page is shown. |
| src/client/board-view.js | 5104 | boardCloseMenus | Put away every open card, seat, goal, verdict and idea menu. |
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
| src/client/keyboard.js | 47 | onSendKey | True when this keystroke is a send, and the keyboard should not stay in |
| src/client/keyboard.js | 69 | onKeyDown | Capture-phase key handler. Runs before the app's own handlers so the |
| src/client/keyboard.js | 497 | onKeyUp | Any keyup ends the hold, so a dropped keyup cannot leave the view scrolling. |
| src/client/keyboard.js | 523 | onEscapeBlur | Escape leaves a focused composer, so the scroll keys come back. |
| src/client/keyboard.js | 548 | onPointerMove | Remember where the pointer is. |
| src/client/keyboard.js | 569 | forgetPointer | Forget the remembered pointer, so the focus and centre rules decide again. |
| src/client/keyboard.js | 574 | onUserScroll | The user took over with the wheel or a touch: abandon our animation. |
| src/client/keyboard.js | 593 | onFocusLoss | Losing the window or the tab must not leave a hold or a stale pointer |
| src/client/keyboard.js | 611 | onPointerDown | A press says where the keyboard should be: inside a text field it asks |
| src/client/keyboard.js | 636 | dismissOutsidePress | Put an open window away when the press landed beside it. |
| src/client/keyboard.js | 672 | pressMissesWindow | Whether a press landed outside an open window's card. |
| src/client/keyboard.js | 689 | pointInSelection | Whether one right press landed inside the words the reader selected. |
| src/client/keyboard.js | 724 | leaveBoardPage | Leave the board's page for the conversation it was opened from. |
| src/client/keyboard.js | 754 | onContextMenu | The way between a conversation and the board: a right press, both ways. |
| src/client/model-picker.js | 118 | openNewSessionModelPick | Open the model window for the sheet's model row. |
| src/client/model-picker.js | 158 | openModelPick | One press of the model key: open the picker on the list of models the |
| src/client/model-picker.js | 370 | modelPickHint | The line under the picker: what it is showing, and what the keys do. |
| src/client/model-picker.js | 399 | renderModelPick | Repaint the picker's rows and footer from `MODELPICK.entries`. |
| src/client/model-picker.js | 422 | markedLevel | The level one row is currently marked with. |
| src/client/model-picker.js | 437 | confirmLevel | The level one confirm would submit. |
| src/client/model-picker.js | 460 | buildModelRow | One row of the picker: the model's name with the `current` tag in front of |
| src/client/model-picker.js | 515 | buildLevelCell | The levels of one model. |
| src/client/model-picker.js | 568 | levelClickHandler | The press handler for one level chip. |
| src/client/model-picker.js | 582 | keepModelPickVisible | Keep the selected row in sight when the list is longer than the card. |
| src/client/model-picker.js | 604 | openModelWindow | Mount the picker, with the selection already on the model in effect. |
| src/client/model-picker.js | 670 | closeModelPick | Unmount the picker and forget everything it was showing. |
| src/client/model-picker.js | 706 | moveModelPick | Move the picker's selection, wrapping at both ends. |
| src/client/model-picker.js | 734 | moveModelPickEntry | Put the selected model somewhere else in the list, and remember it there. |
| src/client/model-picker.js | 774 | reorderFavorites | Put an ordered list of pairs back into the configured one, in the new |
| src/client/model-picker.js | 802 | stepModelPickLevel | Step the level of the selected row, wrapping at both ends. |
| src/client/model-picker.js | 831 | confirmModelPick | Confirm the selected row: submit its model at its marked level, then take |
| src/client/model-picker.js | 898 | modelToast | The one-line notice after a switch, naming the level when the row has one. |
| src/client/model-picker.js | 920 | modelPickKeyDown | Route one keystroke to the open picker. |
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
| src/client/sessions.js | 206 | conversationPool | Every conversation worth offering, newest first. |
| src/client/sessions.js | 253 | sortByRecency | Sort rows by recency, newest first, with the id as a deterministic |
| src/client/sessions.js | 272 | hereIndex | Where the conversation on screen sits in a list, or 0 when it is not |
| src/client/sessions.js | 293 | folderIndex | Which folder each conversation lives in, as `{ label, path }` keyed by |
| src/client/sessions.js | 330 | folderById | One workspace, by the id the board files its goals under. |
| src/client/sessions.js | 357 | folderLabel | What a folder reads as on a row: the Workspace's own title, else the last |
| src/client/settings-page.js | 47 | SendHintLine | The line that names the send key, contributed to the shell's own dock row |
| src/client/settings-page.js | 112 | onComposerTitleKey | What Enter and Escape mean in the title field. |
| src/client/settings-page.js | 128 | ComposerTitleField | The title field itself: one line, kept uncontrolled, read on Enter. |
| src/client/settings-page.js | 148 | sendKeyLabel | The modifier this machine's send accelerator lives on, named the way the |
| src/client/settings-page.js | 241 | makeTranslator | Translate through the locale seat when it is wired, else through the |
| src/client/settings-page.js | 257 | KeyRow | One rebindable key: focus the box, press the key you want. |
| src/client/settings-page.js | 297 | SliderRow | One numeric preference. |
| src/client/settings-page.js | 327 | ChoiceRow | A short set of mutually exclusive options, as a row of toggles. Used for |
| src/client/settings-page.js | 373 | ModelListGroup | The switchable models as one settings group: what is chosen, in the order |
| src/client/settings-page.js | 380 | reload | Read the catalog again: it is refilled as adapters and credentials change. |
| src/client/settings-page.js | 410 | reorder | Put one pair at a place in the list, or take it out of it. |
| src/client/settings-page.js | 418 | toggle | Append one pair, or drop whichever entry carries that key. |
| src/client/settings-page.js | 431 | action | One small square button: move an entry, or take it out. |
| src/client/settings-page.js | 566 | VimSection | The whole Settings → Vim scrolling page. |
| src/client/settings-page.js | 582 | set | Apply a patch and surface a rejection in the page. |
| src/client/settings-page.js | 588 | keyRow | One rebindable-key row, bound to its seat. |
| src/client/settings-page.js | 603 | sliderRow | One numeric row, bound to its seat. |
| src/client/settings-page.js | 628 | boolRow | One on/off row, bound to its seat. |
| src/client/settings-page.js | 654 | choiceRow | One row of mutually exclusive options, bound to its seat. Same shape as |
| src/client/settings-page.js | 802 | installSettings | Contribute the settings page and its vocabulary. Both contributions are |
| src/client/strings.js | 817 | localeIsZh | Best-effort locale guess, used for the nav label and fallback strings. |
| src/client/strings.js | 823 | paletteText | Built-in string for the task window; it is plugin chrome, not shell copy. |
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
| src/client/turns.js | 62 | makeTurnPeek | The ledger behind `TURNS`, and the only thing that touches it. |
| src/client/turns.js | 148 | makeSaidPeek | The ledger behind `SAID`, and the only thing that touches it. |
| src/client/turns.js | 226 | turnsOf | The turn count already peeked for a conversation, or null. |
| src/client/turns.js | 239 | requestTurns | Queue a turn count for every loaded row that does not have one yet. |
| src/client/turns.js | 252 | drainPeeks | Start as many queued peeks as the concurrency budget allows. |
| src/client/turns.js | 269 | wantSaidFor | Ask what each conversation was last given, before its card is built. |
| src/client/turns.js | 287 | drainSaid | Start the asks the budget allows, and paint what lands. |
| src/client/turns.js | 308 | promptOf | The last words a conversation was given, out of its turn outline. |
| src/client/turns.js | 330 | peekSaid | Read one conversation's last prompt, and let go of it again. |
| src/client/turns.js | 336 | finish | var timer = null |
| src/client/turns.js | 372 | read | A conversation that is not on screen has no binding until the host has |
| src/client/turns.js | 428 | peekTurns | Read one session's `sessionStats.turns` and let go of it again. |
| src/client/turns.js | 434 | finish | var timer = null |
| src/client/turns.js | 473 | accept | var face = projections.faceOf('sessionStats') |
| src/client/turns.js | 497 | cancelPeeks | Drop every queued and in-flight peek; the window closed or unloaded. |
