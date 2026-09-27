# Booking and availability UX review — 17 September 2026

Baseline: `feature/dated-workshops` at `c723034`. The empty Workshop Scheduler project was populated from the verified local checkout, preserving its Git history. All changes in this review are in the new project directory; the earlier checkout and hosted preview are unchanged.

## Walkthrough findings

The local app was started against a fresh, isolated PostgreSQL database. The review followed the admin dashboard into Classes & teachers, the class editor, Workshops, and direct booking, and saved a sample dated workshop. The revised directory and teacher-to-booking path were then inspected in the browser.

- The original booking form opened with three new records before showing time fields. Even with saved schools and teachers, it appeared to require creating the entire hierarchy again.
- Class cards showed a count of availability blocks rather than the times. The only route to editing those times was a generic Edit class action.
- The class editor always offered Return to monthly planning, including when the admin arrived from the directory. Its prominent planning defaults competed with the task of entering availability.
- There was no clear explanation of the difference between a teacher contact, a student group, recurring availability, and one dated workshop.
- Saving a booking opened another edit form without an explicit route to the next step, staffing.

## Changes

1. Booking begins with a concrete date, start time, and end time. A summary shows the host, selected date and time, and staffing target before saving.
2. Saved schools are offered before new-record entry. Teacher choices are limited to the selected school; new contact fields appear only when adding a contact. Saved classes still fill the school, teacher, and defaults together.
3. A class label is optional for direct booking. A blank label uses a reusable `Workshop group` scoped to the teacher and school. Named student groups remain available for teachers hosting multiple classes. The existing class model, conflict checks, and atomic booking transaction are retained; no migration is needed.
4. Class cards display actual weekly availability separately from the next booked workshop. **Book a date** and **Weekly availability** lead directly to their respective tasks. Teacher contacts also provide a booking link with the correct host already selected.
5. The class editor explains that recurring availability does not create workshops. Monthly defaults are collapsed except when returning from planning or displaying validation errors. The monthly-planning return link appears only for a planning detour.
6. Successful booking gives an explicit **Assign PAs to this workshop** link. The workshop remains a private draft until publication.

## Iteration corrections

- Changing the host resets an automatically calculated end time to the new default; an explicitly edited end time is retained.
- Choosing a teacher with exactly one saved class, including through the directory, selects that class and its duration automatically. The admin can still choose a new student group; multiple saved classes remain an explicit choice.
- Upcoming workshop links use the actual workshop month and class/school context, preventing an unrelated directory filter from hiding the booking on return.
- Server validation continues to retain entered values, focus the first invalid field, and expand advanced staffing when needed.

## Verification

The focused browser suite covers empty-start booking, reuse, error recovery, double-submit protection, mobile accessibility/overflow, weekly availability versus actual booking, booking directly from a teacher without a class label, booking summary updates, and duration changes. PostgreSQL coverage verifies that unnamed groups are reused for the same teacher and kept separate between teachers.

Final check results are recorded in the implementation plan. Test screenshots are retained under `work/direct-booking-desktop.png` and `work/direct-booking-mobile.png`; browser failure artifacts, if any, remain under `work/test-results`.

## Scope

This changes the local application. It does not send teacher emails or publish a hosted deployment. Teacher access remains view-only, and weekly availability remains optional for direct booking but is required for recurring monthly suggestions. A class is still stored internally so existing planning, staffing, conflict detection, and history remain compatible.
