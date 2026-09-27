# Navigation response review

20 September 2026. The test preview was measured after reports that navigation tabs felt slow. Timings below measure a real authenticated sidebar click until the destination's final page heading appears, including its server data work. They do not measure only the URL change or a loading placeholder.

## Findings and changes

- The deployed application functions ran in Virginia (`iad1`), while the dedicated Neon database is in Oregon (`us-west-2`). `vercel.json` now places application functions in Portland (`pdx1`), alongside the database region. Vercel recommends putting functions close to their data source; its [region documentation](https://vercel.com/docs/regions) maps `pdx1` to `us-west-2`. See also [function region configuration](https://vercel.com/docs/functions/configuring-functions/region).
- Navigation previously had no route loading boundaries. The role layouts now show immediate link feedback, and protected pages have static loading placeholders. Month and calendar filters also report pending work. The current tab, modifier clicks, downloads, external links, and mobile navigation retain their expected behavior. Next.js describes this behavior in its [loading UI documentation](https://nextjs.org/docs/15/app/api-reference/file-conventions/loading).
- Layouts and pages repeated the same authentication and live-user lookup within one request. React's request-scoped cache now shares that lookup. No identity, role, deletion status, or school membership is cached across requests.
- The schedule snapshot loaded target sessions again in its nearby-commitment query. That query now excludes already-loaded target IDs while preserving scoped cancellation history and cross-run commitments.
- The date planner wrapped display-only reads in an interactive transaction, serializing otherwise independent reads. Those reads now run concurrently and fetch only the teacher-conflict fields they need. Mutation previews and applies still re-read authoritative state and validate hashes and revisions.

The wording **Schedule class session** replaces **Book workshop**. This does not add automatic selection of dates for a whole run; the planner still requires an admin's class/time choices before its batch review.

## Hosted before and after

Two passes through the same seven routes used the same browser procedure and test database, without reseeding. The second pass is shown to distinguish persistent latency from the first visit alone.

| Page               | Before, second pass | After, second pass |
| ------------------ | ------------------: | -----------------: |
| Workshop runs      |              882 ms |             433 ms |
| Schools            |              911 ms |             158 ms |
| Classes            |            1,365 ms |             478 ms |
| Program assistants |              911 ms |             278 ms |
| Session calendar   |            2,976 ms |             473 ms |
| PA readiness       |            2,929 ms |             440 ms |
| Plan run dates     |            5,072 ms |             464 ms |

The first planner visit fell from 6,577 ms to 990 ms; the first calendar visit fell from 2,950 ms to 979 ms. Vercel inspection confirmed all 66 function outputs are deployed to `pdx1`. Raw measurements and the profiling script are retained under ignored `work/navigation-performance/` and `work/run-planning-release/`. These are diagnostic browser samples, not a latency guarantee or an isolated attribution of savings to each change.

## Review and validation

The existing GPT-5.6 Sol agents independently cross-reviewed the navigation feedback, request-scoped authentication, and schedule read optimizations. All three slices received signoff after correcting feedback on a click to the already-active route. A database regression verifies target/nearby union, cancellation history, deduplication, and exclusion of distant sessions.

Verification passed:

- 162 unit tests and 134 PostgreSQL integration tests across all 15 migrations.
- Nine affected browser cases covering delayed sidebar/query navigation, active-link feedback, rapid composed filters, schedule/change returns, responsive accessibility, and mobile focus/sign-out. The change-return test needed exact destination assertions because its old query-only assertions also matched the source page.
- Full lint, TypeScript, formatting, diff checks, and local and Vercel production builds.
- Hosted sign-in/out, secure two-hour sessions, role isolation for all three roles, participant privacy, and retained Vercel Authentication for anonymous access.
- Thirteen hosted desktop/mobile page states and two deliberately delayed navigation states passed accessibility and overflow checks. No application 5xx responses or browser exceptions were captured in the role/page checks. Both loading screenshots were visually inspected; the renamed session action and absence of a stuck current-tab spinner were asserted.

[The updated test preview](https://workshop-scheduler-test-1kzbvzdtl-bryanj1angs-projects.vercel.app/login) is Ready as `dpl_EyXMYbp4b7zY13NF5MGvtjfBQz32` in the existing `workshop-scheduler-test` Preview project. All 233 exported non-document source/configuration files match the reviewed workspace. Hosted role/page reports are in `work/run-planning-release/hosted-navigation/`, and timing/loading evidence is in `work/navigation-performance/`. No reseed or scheduling-data migration was performed; the existing demo and subsequent test changes were preserved.
