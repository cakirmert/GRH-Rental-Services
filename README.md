# GRH Rental Services

Welcome to the codebase for the GRH Rental Services, a Next.js application used to reserve rooms, equipment and games. This guide explains how to get the project running locally and highlights the main pieces of the codebase so you can dive in quickly.

## Features

- Single Page App (no full page reloads)
- Multiple views for booking, dashboards, help pages and more
- Realtime chat and push notifications
- Passwordless email authentication
- Admin and rental dashboards
- Multi-language support (English & German)
- Responsive UI built with Tailwind and shadcn/ui
- Typed API via tRPC and Prisma ORM

## 1. Prerequisites

- **Node.js** – LTS or newer
- **npm** (or another package manager such as pnpm or Yarn)

## 2. Installation

```bash
# clone the repository and move into it
npm install
```

This installs all server and client dependencies including Prisma for database access.

## 3. Database Setup & Seeding

The application uses PostgreSQL. Provide a `DATABASE_URL` pointing to your database and Prisma will generate the schema and seed it with sample data.

Generate the database and seed it:

```bash
npm run seed
```

Reset or recreate it if needed:

```bash
npx prisma migrate reset
```

This wipes the database, applies the schema, and runs the seed script in one step.

Explore the DB with Prisma Studio:

```bash
npx prisma studio
```

## 4. Running the Application

Start the development server:

```bash
npm run dev
```

The app will be available on `http://localhost:3000`. You can also connect via your local IP on another device for testing.

For production builds:

```bash
npm run build
npm run start
```

## 5. Directory Structure

```
├─ src/
│  ├─ app/            # Next.js routes (app router)
│  ├─ components/     # Reusable React components
│  ├─ contexts/       # Shared React contexts (i18n, auth, views)
│  ├─ hooks/          # Custom React hooks
│  ├─ lib/            # Helpers (auth, Prisma client)
│  ├─ server/         # TRPC routers and server setup
│  └─ utils/          # Client-side utilities
├─ prisma/            # Prisma schema and seed script
├─ public/            # Static assets
```

### Key Files

- **`src/app/layout.tsx`** – global layout applying providers and styles
- **`src/server/routers`** – TRPC routers handling bookings, items, chat, and admin actions
- **`prisma/schema.prisma`** – database models for users, items, bookings, and notifications

## 6. Important Concepts

- **Authentication** – Passwordless email sign-in using one-time codes. The configuration lives in `auth.ts` and uses NextAuth with Prisma as an adapter.
- **TRPC API** – Typed API routes defined under `src/server/routers`. The client uses hooks in `src/utils/trpc.ts` to call them.
- **Views & Components** – The main page switches between list view, booking forms and dashboards using a view context (`src/contexts/ViewContext.tsx`). UI pieces live in `src/components`.
- **Localization** – JSON translation files in `src/locales` with language preference stored in `localStorage`.
- **Prisma Models** – Items, bookings, users, and chat records are defined in the Prisma schema and seeded with initial data.

## 7. Learning Path

1. **Run the app locally** using the steps above.
2. **Explore the Prisma models** (`prisma/schema.prisma`) to understand relationships.
3. **Read through TRPC routers** in `src/server/routers` to see how the frontend communicates with the backend.
4. **Study core components** such as `BookingFormView` and `MyBookingsComponent` to learn how forms and state are managed.
5. **Check NextAuth hooks** to see how session data and protected routes are handled.

## 8. Useful Commands

```bash
npm run dev       # start the dev server
npm run build     # build for production
npm run start     # start the production server
npm run seed      # run Prisma seed script
npx prisma db push  # apply schema changes
npx prisma db seed  # re-seed the database
```

### Web Push Setup

Generate VAPID keys for push notifications:

```bash
npm install -g web-push
web-push generate-vapid-keys
```

Add the keys to `.env.local`:

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
```

These are required by `src/app/actions.ts` to send notifications.

## 9. Environment Variables

`next.config.ts` reads `AUTH_URL` and `AUTH_SECRET` instead of the old NEXTAUTH variables. You will also need `EMAIL_PASSWORD` for sending OTP codes and the blob storage keys `BLOB_URL_BASE` and `BLOB_READ_WRITE_TOKEN`. Copy `.env.example` to `.env.local` and fill in the values when deploying.

---

This README should give you a solid foundation for understanding and extending the project. Happy coding!
