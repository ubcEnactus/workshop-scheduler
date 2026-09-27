# Workshop calendar overview

## Design and behavior

Once a workshop has published sessions, its default page becomes a calendar overview. The calendar is scoped to one workshop and opens at the next scheduled session, or the most recent session when delivery has finished. Explicit Plan, Staff, Publish, batch, and teacher links keep their existing destinations. The calendar is also available before publication through View workshop calendar.

The hierarchy is workshop title and delivery window, summary counts, published sessions needing attention, calendar and selected-day details, then workshop details. Dates show session counts on narrow screens and time/school previews on wider screens. The selected-day panel shows every session on the date, status, school, teacher, location, PA team, staffing warnings, and View & edit session. Cancelled history is available through the status filter. All dates are grouped in America/Vancouver; navigation is not limited to the delivery window.

Continue scheduling returns to the relevant draft workflow. Publication exposes Open workshop overview. Sessions use the existing reviewed mutation flow, with the originating calendar month preserved through review and apply. Master schedule return links retain their existing filters. Workshop details reuse the same form, validation, stale-edit guard, and delivery-window checks as the directory, with a return to this overview.

No schema migration or scheduling-data conversion is required. Earlier sessions, assignments, and recorded host names are preserved. No participant permissions change.

## Verification

245 unit tests and 256 PostgreSQL integration tests pass. Six affected browser journeys pass: the new overview with mixed states, cross-month navigation, host snapshots, isolation from other workshops, in-place workshop detail edits, both reviewed-edit return paths, publication refresh safety, and desktop/mobile planning. Calendar desktop/mobile accessibility checks report no WCAG A/AA violations or horizontal overflow. Screenshots were visually reviewed. An initial browser test exposed an ambiguous status-selector label; the explicit Session status label is now verified.

Lint, TypeScript, formatting, diff checks, and the production build pass. No database migration is required.
