# Plan page hierarchy

Implemented locally, 23 September 2026. This UI follow-up is separate from the previously deployed workshop-workspace release.

## Interaction

- The shared delivery window is not a booked session. Each included class receives one specific date and time; admins can save a subset and finish the other classes later.
- Date-selection cards come first. The duplicate included-class management list is collapsed below the planner, with its teacher, availability, lifecycle and saved-session links preserved.
- Week browsing is a separate, collapsed “Change week” control. Its explanation makes clear that changing the displayed week does not assign any class date.
- Class names are primary, school names secondary, and date options no longer contain verbose staffing counts. Detailed staffing estimates remain available on demand.
- Unsaved selection review and optional shared session details are collapsed. Selected dates are explicitly marked as not saved.
- A sticky action bar keeps Save dates and Save dates & continue reachable while scrolling, reports selection/saving/saved state, and explains that PAs come next in Staff. Publication stays separate.

## Verification scope

The focused browser suite covers desktop and 390px hierarchy/accessibility, keyboard focus, collapsed controls, Add classes navigation, no writes before Save, clearing a choice, saving only one included class, saved-session management, cross-week/month retention, availability detours, failed and late background checks, validation retry, duplicate submission, creation/enrollment and the connected staffing/publication journey. Existing behavioral assertions remain; renamed controls and newly collapsed management require explicit test navigation.

Tests run in an isolated source copy with independent Next.js artifacts and disposable PostgreSQL databases. This avoids concurrent shared-workspace test/build interference. No demo database migration, reset, reseed or deployment is part of this UI follow-up.

## Results

- 243 unit tests and 233 PostgreSQL integration tests passed.
- 31 affected browser regressions passed. After visual review identified a focused desktop disclosure beneath the sticky footer, focus scrolling was corrected and all eight Plan-specific browser checks passed again. The new desktop/mobile assertions require keyboard focus to remain fully above the action bar.
- Lint, TypeScript, formatting and diff checks passed.
- The final production build passed after the keyboard-focus correction. All 265 source/test/script/schema files match the isolated verification copy.
- Desktop and 390px screenshots were visually inspected; automated accessibility and horizontal-overflow checks passed. Screenshots are local-only under the isolated copy's `work/plan-hierarchy-*.png`.
