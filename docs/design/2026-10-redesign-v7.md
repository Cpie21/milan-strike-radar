# Redesign v7: one grammar for the date rail, and an all-dates sheet

## Problem (owner)
The top of the page looked messy because columns did not agree line by line:
- **Top line:** sometimes a weekday, sometimes a date range.
- **Middle line:** sometimes a date, sometimes the tick marks of a fold. A fold cut through the run of dates exactly where a date should be.
- **Bottom line:** four kinds of mark — filled glyph, outline glyph, struck-out grey glyph, and nothing. "Strike / no strike" had been split into too many states.

A classmate also pointed out that "选择日期" (pick a date) should become a view of every date on one page.

## Changes
- **Three fixed lines per column.** Weekday, date, what strikes. Every column follows this, the past strip included (it uses narrower columns, a sunken material and grey).
- **No more folds.** An unbroken run of dates reads more easily, and the month sheet covers long jumps.
- **Two states only.** A day has a strike or it doesn't. Called-off strikes no longer mark the rail; the card explains them.
- **Signage badges.** Every mode mark is now a `ModeBadge`: a filled square in the mode's deep colour with a white pictogram.
  - Metro is the white "M" on red that Milan, Rome, Turin and Naples metro signs all use.
  - Bus, train and plane use front-on pictograms (Phosphor `Bus`, `Train`, `AirplaneTilt`). At 14–18px a front view stays readable where a side view blurs.
  - Badges overlap slightly, each with a ring in the surface colour, so three of them fit in a 54px tile.
  - The same badge appears on the rail, the month sheet, the jump chips, the "下一次罢工" (next strike) row, the card header, the city list and Ask.
- **"查看全部日期" (all dates) sheet.** It replaces the native date picker. One block per month, from this month on, Monday-first. Each block has a header showing how many strike days that month has, and a legend sits at the top. Strike days get a filled cell with badges; past days are dimmed; today has a ring; the selected day is white. Tapping a day selects it and closes the sheet. The sheet opens at full height.
