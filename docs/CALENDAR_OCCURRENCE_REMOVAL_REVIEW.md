# Teacher calendar occurrence removal

Implemented and deployed to both public demos on 27 September 2026 at the user's subsequent request. See [deployment details](VERCEL_PREVIEW.md#calendar-occurrence-removal-release).

## Delivered behavior

- Removed **Date-specific changes and school closures**, **Add a school-wide closure**, and their creation forms, Server Actions, and unused creation schemas.
- Added **Remove for this date**, immediate **Undo**, and durable **Restore** to weekly calendar cards. Other weeks, other weekly sources, and independently recorded dated availability remain available.
- Grouped ranges from the same weekly source into one card and aligned calendar badge counts with those cards. Existing teacher/school restrictions remain visible on their affected dates, with explicit management controls. School-wide reopening states its scope in the button.
- Extracted the selected-date availability card into a focused component. Added pending states, screen-reader feedback, and focus on the result after removal/restoration. Kept whole-pattern deletion separately labeled **Remove weekly time**.
- Protected overlapping draft, published, and completed sessions with a **Manage session first** link. No session or assignment is changed by occurrence removal. Cancelled sessions do not block the action.

## Storage and consistency

Migration `20260927194703_teacher_calendar_occurrence_skips` adds only `ClassMeetingSkip`, its unique source/date index, and a cascading foreign key. It was generated using `npm run db:migrate -- --name teacher_calendar_occurrence_skips` on a disposable PostgreSQL cluster with all 21 previous migrations and populated seed data. No existing table or data is removed.

The schema and generated migration are committed as `add223c`. Application changes remain in the existing working tree alongside the earlier work; unrelated concurrent changes were not included in this commit. The migration was applied to both dedicated demo databases before promoting the new builds.

The shared resolver, run workspace, enrollment reader, teacher calendar, session editor, and save-time scheduling validation load the same skips. Derived readiness continues to use current candidate counts. A stale planner cannot save a time whose sole authorizing weekly occurrence was removed.

Occurrence mutations use the existing scheduling lock. Each mutation advances the weekly record revision; the skip records its source revision. Duplicate removal requests return the current saved result. After restoration, an old removal request fails its revision check. Restore must match both the current revision and exact skip ID, so late Undo cannot undo a replacement removal.

Legacy restrictions are preserved. Disposable browser fixtures cover an existing partial school closure and dated additions. Subsequent deployment preflight found no existing school closures or teacher exceptions in either demo. Database-side fingerprints verified every existing record in all 25 retained tables unchanged after the additive migration; no full row exports, resets, seeds, or scheduling-data mutations ran.

## Verification

- Unit tests: 239 passed, including source-specific exclusion, independent dated/weekly sources, daylight-saving dates, and occurrence input validation.
- Database integration tests: 248 passed, including ownership/role/lifecycle checks, retries and late Undo, exact historical hours, cascade deletion, booked-session protection, legacy restriction management, and rejection of stale planning submissions.
- Browser regressions: all 8 passed across occurrence removal, the existing dated calendar flow, teacher setup/enrollment, planning hierarchy, and cross-month planning returns. Desktop and 390px mobile screenshots were visually inspected. Accessibility scans reported no violations; mobile overflow checks passed. Removal/restoration feedback retained keyboard focus.
- `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`, and `git diff --check` passed. The production build completed all static-generation and route checks.

Browser screenshots are in ignored `work/calendar-occurrences-desktop.png` and `work/calendar-occurrences-mobile.png`.

Deployment verification passed on both public aliases: 39 general desktop/mobile page states plus the existing October 6 weekly occurrence at desktop/mobile sizes. The removal control is visible, the retired sections are absent, and accessibility/overflow checks passed. Actual remove/Undo/Restore mutations were exercised in disposable local tests; hosted verification preserved existing scheduling data. Live evidence is under ignored `work/calendar-release-20260927/hosted/`.
