# Usability implementation review — 16 September 2026

This follow-up implements the recommendations in `UX_IMPROVEMENTS.md` on `feature/dated-workshops`. It keeps the existing navy/amber design and dated-workshop scheduling rules.

## Implemented workflows

- Month, school, class and status view travel in validated URLs through the schedule, planning, matching, quotas, sidebar and return links. The schedule explains and clears unavailable filters. Month and filter controls apply immediately.
- The monthly workspace has compact status filters, responsive workshop rows/cards and an on-demand creation form. Staffing opens a keyboard-accessible side panel with eligible PAs first, remaining quotas and explained exclusions. Changes keep the user in the workspace.
- Ready drafts can be selected together and reviewed before publication. The review shows dates, schools, PAs and blocking problems. The server rechecks versions, the complete eligibility snapshot and all selected workshops under the existing transaction lock; a failure rolls back the entire selection.
- Monthly quotas are edited in one table and saved atomically. Previous-month copy remains editable and undoable, explains missing/inactive PAs, and distinguishes blank from zero. Invalid rows retain input; stale edits cannot overwrite a newer schedule or PA roster.
- Availability supports weekday ranges, additive copying to other days, clear-day/clear-all and undo before saving. A compact live total, unsaved indicator and persistent save bar replace the introductory cards. The optional half-hour grid remains available.
- Workshop and batch forms use class defaults and explicit date/time suggestions from recorded class availability, excluding existing conflicting workshops. Validation errors retain the entered values. Suggestions do not infer school holidays; manually chosen dates and the entire batch are validated by the server.
- The dashboard provides month-specific staffing/publication/review tasks and direct links to missing quotas and class availability.

## Review and corrections

The first implementation pass was checked against existing integration and browser workflows, followed by targeted tests of the new interactions. Review corrected accessible select labels, context restoration after navigation, premature controlled-input edits during hydration, stale publication-review recovery and selection cleanup when changing filters. Editing a draft excludes that draft from its own suggestion conflicts.

After the usage reset, three fresh GPT-5.6-sol reviewers independently reviewed usability, regressions, and scheduling safety. The usability and regression reviewers also implemented corrections; each patch received cross-review. All three gave explicit scoped signoff with no outstanding findings. The primary agent owns the combined automated and hosted validation below.

The fresh review corrected these additional issues:

- Publication success immediately updates row state and draft actions while the server refresh is pending. Filtered lists also update their count and empty state.
- Rapid month/school/class changes compose from the latest requested selection instead of discarding an earlier in-flight filter. Back-navigation tests wait for the URL to commit rather than treating optimistic input text as a browser history entry.
- A class-availability detour preserves the planning month, selected classes and entered workshop rows through validation errors and successful edits. Return routes are fixed internal paths; browser drafts are bounded, opaque-UUID scoped and checked against month, class selection and a two-hour age limit.
- Detail staffing, locking, publication, and published-change review/apply retain the originating schedule filters and month.

The scheduling reviewer confirmed role-first authorization, version and eligibility rechecks under the shared lock, all-or-nothing quota/publication writes, audit integrity, and unchanged PA/teacher published-only privacy. The reviewers inspected source and existing desktop/mobile captures; database/browser execution and final hosted verification were performed by the primary agent.

## Validation record

- Unit suite: 118 passing tests, including navigation normalization, bounded planning-return validation, availability range/copy boundaries and date suggestions across month/leap/DST cases.
- Database integration suite: 92 passing tests. New cases cover role authorization, blank versus zero quotas, mixed invalid rows, duplicate/omitted/inactive PAs, stale writes, staffing versions, atomic publication/audits, concurrent publication, form-error retention and batch rollback/idempotency.
- Browser suite: all 29 normal workflow tests and the separate HTTPS preview-login test pass. Cases cover month/filter continuity, keyboard focus trapping/return, in-place staffing, blocked/stale publication and recovery, quota copy/undo/stale editing, mobile range copying and clearing, planning rollback/input retention, class defaults and unavailable filters. Five additional review regressions cover planning detours, delayed publication refresh, rapid filter changes, detail-action return context and published-change review/apply context.
- The existing visual/accessibility audit checks 51 desktop/mobile states with zero axe violations and zero document overflow. Additional workspace checks cover 390px mobile, 900px narrow desktop and the 720px reflow viewport equivalent to a 1440px display at 200% zoom. Selected screenshots were inspected locally, including the monthly workspace, staffing panel, planning form and availability editor.
- All 240 automated tests pass. Lint, TypeScript, formatting, `git diff --check` and the production build pass.
- Hosted verification passes on [the protected preview](https://workshop-scheduler-test-rgb1impml-bryanj1angs-projects.vercel.app/login), deployment `dpl_4HU6KuvSnG3bykXnTopjNePZSihb` (Ready). All three demo accounts complete real HTTPS login/logout with correct roles, secure two-hour sessions and both other-role routes denied. The existing teacher/PA published workshop remains visible and the admin draft stays private.
- Hosted workspace, staffing panel, mobile quotas and availability checks find zero axe violations, no document overflow and correct focus return. The availability Save button remains within the 390×844 viewport. Anonymous requests still meet Vercel SSO protection; no application 5xx responses were captured. Twelve screenshots and `verification.json` are retained in the Codex task at `outputs/vercel-preview-ux-reviewed/`. All 113 source files match the reviewed repository export.

## Practical limits

Automated tests cover the documented rules and tested workflows, not every possible interaction. School holiday knowledge remains an admin responsibility. Suggestions for separate unsaved batch rows can overlap; the batch action rejects overlaps atomically and retains all entries for correction. Changes to published workshops retain their separate reason-and-review flow. Availability undo is for the last unsaved edit, not a historical rollback. Planning draft restoration requires browser session storage and remains local to that browser tab; disabled storage does not block navigation but prevents draft restoration.

The protected preview uses the approved demo accounts. No schema migration or database reseeding is needed for this usability change. Production email delivery and real-user task-completion studies remain outside this preview validation.
