# Application structure and previews

The application uses Next.js App Router with client-side navigation between
screens. The persistent shell and providers keep the single-page experience;
ordinary navigation does not replace the browser document. Existing query-style
bookmarks can render their corresponding screen directly.

## Structure

- `src/app`: route entry points, metadata and server access boundaries.
- `src/components`: shared interface primitives and application controls.
- `src/features`: catalog, booking request, bookings, staff and admin features.
- `src/server/modules`: booking/admin policies, database work and effects.
- Shared Berlin-time, availability, authentication and retention helpers.

Public catalog content can render on the server. Private queries and drafts are
scoped to the signed-in account and current permissions. Booking drafts survive
locale changes but are discarded when their account/item scope changes.

## Interface behavior

Calendars are staff/admin tools. Calendar feedback and classic-view controls
belong inside the calendar page. General problem reporting is accessible from the
header, including a private contact route for signed-out visitors.

Both calendar layouts share the same backend authorization and recurring-block
policy. Selecting the classic layout does not select a different backend.

## Preview validation

Use the guarded local runner with synthetic private records for visual changes.
Check English/German, light/dark, desktop/mobile, keyboard focus and horizontal
overflow. Keep email, push, uploads and external issue delivery disabled.

A hosted preview needs its own database and secrets, explicit access protection
and a reviewed passkey configuration. See [preview testing](preview-testing.md).
Record actual release acceptance in the private operations runbook rather than
turning this guide into a chronological deployment log.
