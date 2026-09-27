# Weekly PA availability and read-only calendar

Implemented locally; not deployed as part of this change.

PAs enter a time range and select Monday–Friday checkboxes beneath it. One action adds the range to every selected weekday; overlapping times merge, and the weekly list shows every day together. Remove, clear, and undo operate on the unsaved weekly schedule, with an explicit save and the existing concurrent-edit protection.

The calendar below uses the teacher calendar's month grid, green availability, blue workshops, and selected-day sidebar. It renders saved availability according to effective dates and existing admin restrictions, using the matcher's coverage rules. Unsaved changes do not alter the calendar. Only the selected PA's published assignments appear; draft sessions and admin exception notes are not sent to the PA calendar. Calendar navigation and date selection do not change scheduling records.

PA time-off and date-specific availability forms and Server Actions are removed. The individual-slot grid is admin-only. Admins retain their existing detailed editing controls and share the weekly block input and read-only calendar. Earlier records, effective versions, and assignments are preserved. Time off is communicated manually.

No schema migration is required. Unit and integration suites passed (242 and 255 tests). All 20 selected browser journeys passed, including the weekly-only PA flow, published-assignment privacy, effective-date calendar navigation, admin editing, stale saves, staffing, and publication. The calendar test passed again after the final mobile layout adjustment. Desktop/mobile accessibility checks found no WCAG A/AA violations or horizontal overflow; screenshots were visually reviewed. Formatting, lint, TypeScript, production build, and `git diff --check` passed. Evidence is retained in ignored `work/pa-calendar-*.log` and `work/pa-weekly-calendar-*.png`.
