# Workshop Scheduler — pilot direction

This is the direction we have agreed on for the pilot. Some of it differs from the app today, so use the Prisma schema, migrations, and routes when you need to understand current behaviour. Use this brief to understand where we are taking it.

## The short version

We need to assign instructors (PAs) to workshops at schools across the Lower Mainland. A class normally receives one or two workshops per month during the active school year.

This should feel like an admin planning tool, not a marketplace where teachers and PAs negotiate assignments. Teachers provide their class schedules outside the app, PAs tell us when they are available, and the admin takes it from there. The admin decides when each workshop will happen; the scheduler's job is only to staff those workshop slots with available PAs.

**Teacher schedules → admin enters class times → admin creates dated workshop slots → PAs submit availability → Create Schedule assigns PAs → admin publishes**

## What a normal month should look like

Teachers first provide their class schedules. The admin enters those meeting times in the app so they can see when each class is available.

At the start of the month, the admin chooses all classes or a smaller set and creates their workshop slots. The number of slots comes from each class's configurable cadence, usually one or two. For every slot, the admin chooses the class and a concrete date and time from its meeting schedule. They can edit the list or add an ad hoc slot whenever needed.

PAs submit their recurring weekly availability, and the admin sets each PA's workshop quota for the month. When the admin clicks **Assign PAs**, the matcher assigns current, available PAs to the workshop slots that already exist. It does not choose or move workshop times. Anything it cannot staff stays unassigned with a useful explanation.

The admin reviews the assignments, fixes anything that needs human judgement, locks the workshops they are happy with, and publishes the schedule.

Once published, an assignment is official. PAs do not accept or decline assignments in the app, and teachers cannot request or change workshops. If something changes, the admin reopens only the affected workshop, finds a replacement or new time, and leaves the rest of the schedule alone.

After delivery, the admin marks the workshop completed. Cancelled workshops stay in the history rather than disappearing.

## Decisions we have made

### Use the calendar, not cycles or terms

We do not need a separate cycle or term record. The admin works one calendar month at a time and moves forward when they are ready. Previous months remain available as history, and future months are available whenever the admin wants to start planning.

The selected calendar month is the planning boundary for workshop creation, PA quotas, matching, and publishing. There is no globally open period and no period status to maintain.

### Treat every workshop as a real occurrence

A `Workshop` is one slot that the admin has decided will happen. It belongs to a class and already has a concrete start and end time before PA matching begins. Its date naturally places it in the correct calendar month. It can then be staffed, published, completed, cancelled, or replaced.

The admin creates each month's workshops from class cadence and can edit the result. Moving to another month is just calendar navigation; it does not open or close anything.

The main concepts are:

- `ClassSection`: its school, teacher, meeting times, and monthly workshop cadence.
- `Workshop`: one dated slot, its start/end time, staffing needs, and status.
- `Assignment`: the PA assigned to that workshop.

### Keep the admin in control

Only admins change workshops, schedules, and assignments. **Assign PAs** produces draft PA assignments for existing slots; it does not create workshop slots or make final commitments on its own.

Admins need to be able to move a workshop, add or remove a PA, see conflicts, and lock work before rerunning the scheduler. A rerun must not disturb locked or already-published workshops.

PAs only submit availability. Teachers are view-only. Both roles see published information rather than internal scheduling drafts.

### Match volunteers fairly

PAs are UBC student volunteers, so the matcher must respect their workload rather than treating every open hour as usable. Each PA has an admin-set monthly workshop quota. The matcher should distribute work fairly toward those quotas, show each PA's assigned-versus-quota count, and never exceed a quota automatically. It is acceptable to finish below quota when the available slots cannot be assigned safely.

Automatic matching must never give a PA back-to-back workshops. Consecutive assignments need a configurable minimum gap for travel, setup, and breathing room, even when the workshops are at the same school. If a slot cannot be staffed without breaking availability, the monthly quota, or the minimum gap, it should stay unassigned for the admin to resolve.

### Do enough travel handling for the pilot

We are not trying to solve Vancouver traffic on day one. The required minimum gap provides the first layer of protection. For the pilot, store school addresses and warn when travel between otherwise valid assignments still looks risky.

Live routing, map optimization, and automatic route planning can come later.

## What is in the pilot

- Invite-only access and admin management of PAs.
- A calendar-month planning view with no cycle or term workflow.
- Configurable cadence per class.
- Workshop-slot creation for all classes or a selected set.
- Ad hoc workshop creation.
- PA availability and admin-entered class meeting times.
- PA matching against existing workshop slots, with useful explanations for unstaffed slots.
- Admin-set monthly workshop quotas and fair distribution across PAs.
- A required minimum gap between every PA assignment.
- Manual adjustments, locking, and publishing.
- Cancellation and PA replacement.
- PA and teacher views of published workshops.

We are deliberately leaving out live routing, calendar sync, advanced optimization, workload analytics, teacher self-service requests, detailed qualification matching, and fully automatic rescheduling.

## Suggested build order

1. Secure invite-only access and add PA administration.
2. Remove the `Cycle` dependency and move workshop planning to calendar months, with a deliberate migration for existing data.
3. Add monthly workshop-slot creation for all or selected classes, with admin-selected dates and times.
4. Change **Assign PAs** to staff existing slots only, balance monthly PA quotas, enforce assignment gaps, and preserve locked work.
5. Add admin overrides, publishing, cancellation, and replacement.
6. Add integration coverage, browser smoke tests, deployment, and basic monitoring.

Each step should leave the app usable and include its validation, authorization, migration, and tests. Removing cycles should land as one deliberate feature rather than leaking into unrelated work.
