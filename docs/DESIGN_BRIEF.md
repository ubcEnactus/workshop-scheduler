# Workshop Scheduler — pilot brief

We are a UBC student club running workshops at schools around the Lower Mainland. PAs are student volunteers, teachers host us in their classes, and our admin team coordinates the whole schedule.

The app should make that coordination calmer. It is an admin planning tool, not a marketplace where teachers and PAs negotiate dates.

## The flow

**Teachers share their schedules → admin records class times → admin creates dated workshop slots → PAs submit availability → admin assigns PAs → admin publishes**

Teachers send their schedules outside the app. An admin records the meeting times for each class, then creates the actual workshops for an upcoming calendar month. A workshop is already tied to a class and a concrete date and time before any PA is assigned.

Each class can have its own monthly cadence, normally one or two workshops. The admin should be able to create slots for every class or a selected group, edit the result, and add an ad hoc workshop when needed.

Once the slots look right, **Assign PAs** fills them with available PAs. It does not choose or move workshop times. The admin reviews the draft, makes any manual changes, locks work that should not move, and publishes it. A published assignment is official; there is no PA acceptance step.

If plans change, the admin handles the exception. They can replace a PA, move or cancel a workshop, and later mark it complete without disturbing the rest of the month.

## Who can do what

The admin is in full control. Admins manage schools, people, classes, workshop slots, assignments, publishing, replacements, cancellations, and completion.

PAs have one input: their recurring weekly availability. They can view published assignments but cannot accept, decline, or change them.

Teachers are view-only. They can see published workshops for their school but cannot request, schedule, or reschedule anything in the app.

## How matching should behave

Each PA has an admin-set quota for the selected month. Matching should distribute workshops fairly toward those quotas without automatically exceeding them.

A PA must be available for the full workshop and must have a configurable minimum gap before and after another assignment. That gap applies even at the same school; these are volunteers who need time to travel, set up, and reset.

Locked or published work must survive a rerun. When the constraints cannot be met, leaving a workshop unassigned with a clear reason is better than producing a bad schedule. The admin can always make the final call.

For the pilot, the minimum gap is enough travel protection. Live routing and map optimization can wait.

## The monthly model

The calendar is the planning model. There is no separate cycle or term to open and close. An admin chooses a month, plans it, and moves forward whenever they are ready. A workshop belongs to a month because of its Vancouver-local date.

The core records should stay simple:

- A class connects a teacher, school, recurring meeting times, and monthly cadence.
- A workshop is one dated occurrence with staffing needs and a lifecycle such as draft, published, completed, or cancelled.
- An assignment connects a PA to that workshop and records whether the assignment is still a draft or has been published.
- A monthly PA quota records the admin's intended workload for that PA and month.

## Pilot boundary

The pilot includes invite-only accounts, PA management, class schedules entered by admins, monthly slot creation, PA availability, quota-aware matching, assignment gaps, manual edits, locking, publishing, cancellation, replacement, and view-only PA and teacher schedules.

It does not need teacher self-service, PA acceptance, calendar sync, live routing, advanced optimization, qualifications, or automatic rescheduling.

## Where development resumes

The current repository has the account, school, teacher, PA, class, meeting-time, and PA-availability foundations. Legacy cycle-based database models still exist, although their UI and old date-picking scheduler have been removed.

The next developer should first replace that legacy schema with dated workshops through a committed, data-safe migration. After that, build monthly slot creation before rebuilding PA matching. This ordering protects the main product rule: the admin chooses workshop times; the matcher only chooses PAs.
