# README screenshots

These are unmodified Chrome captures of the running isolated V2 production build
at `http://localhost:3100`, taken on 7 November 2026 from commit `5ad6401`.
They are application screenshots, not mockups or evidence of a production deployment.

| File                         | Source capture                   | Content                                                                      |
| ---------------------------- | -------------------------------- | ---------------------------------------------------------------------------- |
| `catalog-desktop.png`        | `catalog-desktop-en.png`         | Public room catalog and real public item photos                              |
| `booking-desktop.png`        | `booking-desktop-en.png`         | Public Bar details and the booking form, using a synthetic signed-in account |
| `staff-calendar-desktop.png` | `calendar-desktop-en.png`        | Rental staff calendar scoped to a synthetic item and booking                 |
| `admin-desktop.png`          | `admin-dashboard-desktop-en.png` | Aggregate administrator dashboard; no member or private booking lists        |

The capture suite rejects private booking responses outside its synthetic
fixtures. It removes its accounts/bookings afterward and keeps email, push,
uploads and GitHub delivery disabled. No public feedback is submitted. Public
contact addresses and item descriptions already form part of the website.

To refresh the images, follow the root README's isolated database setup, run
`npm run build:local`, start `npm run start:local`, then run
`npm run test:e2e:local` in another terminal. Review the generated images in
`test-results/fullpage-visual/`, copy the four captures above to this directory,
and update this date/revision. Never substitute authenticated production captures.

The full ignored gallery also contains mobile and German views. Only the selected
reviewed English screenshots are committed to keep repository assets manageable.
