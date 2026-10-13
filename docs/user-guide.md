---
title: User Guide
description: Day-to-day use of the Hebrew supervision edition, by role.
---

# User guide — supervision edition

The monitor app is Hebrew, right-to-left and built for a phone on site. Admin is a separate console for BuildGuard staff.
The seeded demo project is "Villa Sharon"; demo accounts are listed in the README.

Open the monitor at `https://buildguard.sher.biz` (demo) or `http://localhost:5173` (local compose). Pick the project, then
use the top tabs. Which tabs you see depends on your role in that project.

| Role | Sees |
|---|---|
| Owner, project manager | everything, including quote comparison; only the owner can release payments or bypass a hold point |
| Inspector | inspections, defects, hold points, lab tests, daily logs, Form 4 |
| Contractor | only their own defects, team, tenders, own profile |

## Inspections

1. **Inspections** → new inspection → choose the phase (a stage 1–15) and a checklist template.
2. Mark each item ✓ / ✗ / n.a. Measurement items take a number; lab items take the lab result; document items take an attachment.
3. A ✗, or a measured value outside the template's limits, opens a defect automatically.
4. Inspection results cannot be edited after saving. To correct one, add a new result: the latest per item counts and the older ones stay in the history.

Limits only apply after a person has cloned a system template, reviewed the extracted numbers and ticked "thresholds reviewed". Until then a number is recorded but never fails an item.

**Templates:** system templates are read-only. Clone one, then add, remove or reorder items in your copy.

## Defects

Open → in progress → fixed → verified. Marking fixed needs an "after" photo. Only an inspector, project manager or owner can verify.
Severity (critical, safety, regular, cosmetic) is set when the defect is opened.

## Photos

- Take a photo from the checklist item or the defect. Pick a tag: defect, inspection, approval, before cover, after.
- Add arrows, circles or text on top of the photo before saving. The original is kept; the markup is stored next to it.
- GPS is attached if the phone allows it.
- **Before cover:** an item that is buried or covered (rebar, pipes, waterproofing) cannot be closed until a before-cover photo exists.
- Photos are compressed on the phone before upload.

## Hold points and payments

A hold point is a check that stops the next step until it is signed off.

1. **Hold points** lists the open ones per phase.
2. Close one with a signer name and role plus an attached document or photo.
3. While any hold point in a phase is open, the phase cannot be approved and its payment milestone cannot be released (the API answers 409).
4. The owner can bypass a hold point with a mandatory written reason. The bypass is audited and shown on the hold point.

## Lab tests and timers

- **Concrete pours:** record element, grade, delivery note, slump and cubes. Add the 7-day and 28-day results; each is checked against the limit for the grade.
- **Formwork removal:** the earliest removal date is computed from the pour date and element type. A failed cube result blocks removal.
- **Timers:** 24 h pressure test and 72 h flood test. Reminders appear as in-app notifications.

The strength percentages and removal days are the values from the checklist, not the standard. A structural engineer must sign them off before anyone relies on them.

## Daily log and Form 4

- **Daily logs:** one per day with weather (filled automatically when a weather provider is configured), headcount per contractor, pours and photos. An inspector approves the day, which locks it.
- **Form 4:** shows each requirement for the occupancy certificate with its status and what is still missing.
- **Reports:** daily-log PDF, inspection-report PDF, project summary PDF and the handover ZIP (תיק מבנה) with all documents and photos.

## Quote comparison (owner, project manager)

Upload contractor quotes (PDF or photo). Each is read into structured terms, flagged by fixed risk rules (for example an advance above 20%) and compared against what the stage requires. By default a built-in mock does the reading; with `QUOTE_ANALYSIS_PROVIDER=claude` Claude does. Treat the output as a prompt for questions to the contractor, not as legal advice.

## Working offline

Over HTTPS the app installs as a PWA. Inspection results and photos taken without a connection are queued on the phone and sent in order when the connection returns; the status badge shows what is pending. Each queued item carries an idempotency key, so a retry never creates a duplicate.

Over plain HTTP (for example `http://10.0.0.100:8110`) the queue still works but the app cannot be installed and cached.

If your session expires you are logged out; queued items stay on the phone and send after you log in again.

## Staff (admin console)

Contractor verification queue, tenders overview, and review disputes. See the README tour.

## Known limits

- No plan tiers or entitlement checks.
- No admin page for editing system checklist templates.
- Invoice approval and "open next stage" do not exist yet.
- The demo accounts have known passwords: change them before real use.
