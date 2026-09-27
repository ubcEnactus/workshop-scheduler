# Simplified scheduling interface

Deployed to both public demos on September 27, 2026.

## Behavior

- Teacher Availability contains weekly times and the calendar. Workshops is a separate, bookmarkable tab, and adding enrollment returns to it.
- Contact, settings, and deactivate/reactivate actions are compact header controls.
- Weekly creation uses a single Monday–Friday choice, with multiple days supported. Saved times authorize suggestions automatically. Existing imported reference-only times require review and save; no activation checkbox is shown.
- Workshop booking, planning, and edit forms implicitly use in-person delivery. Old stored planning drafts normalize their delivery value when restored; historical session/audit records are retained.
- Admins open a PA's Availability from the PA directory or staffing view. Admin and PA pages share one editor and persistence logic, preserving effective schedules, empty versions, and dated exceptions. The editor rejects stale saves, scopes changes to active PAs, and never modifies workshop assignments.

## Migration and compatibility

`20260927204958_enable_all_teacher_weekly_times` changes only the `ClassMeeting.activeForScheduling` default to true. Despite the generated name, it does not rewrite existing records. The final migration was rehearsed against an isolated seeded database: existing weekly rows compared exactly before and after, including inactive legacy values; a new insert without an explicit flag was active.

The final migration correction and schema comment are committed as `8e61325`.

Teacher URLs, calendar occurrence removal/restoration, enrollment, planning returns, effective history, and PA self-service remain supported. The current branch gained a concurrent commit during implementation; validation uses the resulting working tree.

## Verification

- Unit suite: 240 passed.
- Integration suite: 255 passed, including admin/PA permissions, stale saves in both directions, exception ownership, preservation of published assignments, selected-day deduplication, and activation of a reviewed legacy row without losing its removed dates.
- Browser coverage: 20 distinct journeys passed across the broad run and focused reruns. The initial new-test failures were corrected to click the visible weekday labels, wait for PA navigation before capturing its URL, and scope the error assertion away from Next.js's route announcer. The passing teacher test also verifies keyboard selection.
- Teacher desktop/mobile and admin PA mobile checks found no WCAG A/AA violations or horizontal overflow; screenshots were visually reviewed.
- Production build, lint, TypeScript, and formatting passed. `git diff --check` is clean.

Local verification logs and screenshots are under ignored `work/` with the `simplified-schedules`, `admin-pa`, and `verify-weekly-default` prefixes.

## Deployment verification

The frozen 338-file export under `work/vercel-simplified-20260927` was deployed to the existing Vercel project. Both builds reached READY before public aliases were updated. Existing project protection and email configuration were preserved.

- [Ennovate](https://ennovate-workshop-demo.vercel.app/login): `dpl_BaVQsUg9L3DDunW5cNWesiFP5See`.
- [Enspire](https://enspire-workshop-demo.vercel.app/login): `dpl_xeePJy6W9o7ZpSd6SneDj5pZmvH3`.

Both databases now have all 23 migrations applied. Database-side counts and fingerprints matched across all 26 application tables before and after the default-only migration; existing records were unchanged. The weekly availability default was independently verified as true.

Hosted verification passed 45 desktop/mobile page states, including teacher tab separation and weekday controls where teacher records exist, the admin PA editor on both demos, booking without a delivery-mode control, sign-in/out, role restrictions, and cross-demo session isolation. No scheduling records were changed by the checks. No accessibility violations, horizontal overflow, browser errors, or application 5xx responses were detected. Teacher desktop and admin PA mobile screenshots were visually inspected. An initial five-second school-page navigation timeout was resolved by rerunning with a twenty-second hosted assertion timeout.

Release manifests, database comparisons, alias records, hosted results, and screenshots are retained in ignored `work/simplified-release-20260927/`.
