# MRTC Calendar

The centralized event, schedule, responsibility and planning calendar for MRTC.

Every important MRTC activity lives here — institutional events, department and
academic activities, club activities, meetings, workshops, competitions,
seminars and deadlines. **Anyone can open the site and see what is happening
without signing in.** Only three authorized administrators can change anything.

```
Everyone can see what's happening at MRTC.
Authorized admins can organize what needs to happen behind every event.
```

---

## Two experiences, one application

| | Public viewer | Administrator |
|---|---|---|
| Sign-in | Never required | Required |
| Calendar (Month / Week / Day / Agenda) | ✅ | ✅ |
| Event details, search, filters, upcoming, deadlines | ✅ | ✅ |
| Responsibilities | Only those marked public | All, with status and notes |
| Create / edit / archive events | — | ✅ |
| Event notes, attachments, activity history | — | ✅ |
| My Tasks, Quick Notes | — | ✅ |
| Manage organisers, venues, admin accounts | — | Super Admin only |

The public interface is not a stripped-down admin panel — it is the product.
Signing in adds capability to the same surface.

### Permission model

```
SUPER ADMIN  (1)  →  full control, including admin accounts and system settings
STAFF ADMIN  (2)  →  day-to-day event operations
PUBLIC VIEWERS    →  read-only, no account
```

Exactly two Staff Admin places exist, enforced by the server. There are no
student accounts and no registration.

---

## Quick start

```bash
git clone <this repository>
cd Cal.com
npm install

cp .env.example .env          # then edit the seed passwords
npm run dev
```

- Web client: <http://localhost:5173>
- Calendar API: <http://localhost:4000>

The database, organiser and venue lists, administrator accounts and a set of
demo events are created automatically on first boot.

### Production

```bash
npm run build     # compiles the API and bundles the client
npm start         # one process serves the API and the built client
```

Set `NODE_ENV=production` and a strong `SESSION_SECRET`; the server refuses to
start in production without one.

### Other commands

| Command | What it does |
|---|---|
| `npm run dev` | API with reload + Vite dev server |
| `npm run build` | Build both workspaces |
| `npm start` | Serve API and client from one Node process |
| `npm run typecheck` | TypeScript across both workspaces |
| `npm run seed` | Seed a fresh database |
| `npm run reset` | Delete the local database and uploads (development only) |

### Default accounts

Seeded from `.env` the first time the database is created. **Change these
before any real deployment.**

| Role | Email | Password (default) |
|---|---|---|
| Super Admin | `admin@mrtc.edu` | `mrtc-super-admin` |
| Staff Admin | `staff1@mrtc.edu` | `mrtc-staff-one` |
| Staff Admin | `staff2@mrtc.edu` | `mrtc-staff-two` |

Sign in from the discreet **Admin Login** link in the footer, or at `/login`.
Either the full email or just the part before the `@` works as the username.

---

## Architecture

A plain two-workspace monorepo. The client only ever talks to a same-origin
`/api`, in development (through the Vite proxy) and in production (served by
the API process), so no base URL needs configuring anywhere.

```
MRTC Calendar (React SPA)
        ↓  /api
Calendar API (Express + SQLite)
        ↓
  ready to sit behind the MRTC / Club Infin8 backend later
```

```
server/                     Calendar API
  src/
    config.ts               environment and limits
    db/
      schema.sql            the whole relational schema
      index.ts              connection, WAL, migrations
      seed.ts               admins, organisers, venues, demo data
    lib/
      password.ts           scrypt hashing
      session.ts            server-side sessions
      serialize.ts          the one place public vs admin output is decided
      events.ts             readiness counts, venue and team conflicts
      dates.ts              timezone-free date handling, repeat expansion
      validate.ts           zod schemas and friendly messages
    middleware/
      auth.ts               requireAdmin / requireSuperAdmin
      security.ts           CSRF guard, CORS, login throttle
      error.ts              every failure becomes a readable sentence
    routes/                 auth, events, responsibilities, notes, meta,
                            attachments, search, overview, admin
web/                        React client
  src/
    api/                    typed client + caching query hook
    state/                  auth, theme, toasts
    lib/                    dates, colour system, taxonomy labels
    components/             shell, cards, calendar views, panels, dialogs
    pages/                  public pages; pages/admin/ is lazy-loaded
```

### Data model

`users`, `sessions`, `organizations`, `venues`, `events`, `responsibilities`,
`quick_notes`, `event_notes`, `attachments`, `activity_log`, `settings`.

Two deliberate choices:

- **Deadlines are events** (`event_type = 'deadline'`) rather than a parallel
  table, so every calendar query, filter and checklist works for them
  unchanged, while the UI still gives them their own styling and section.
- **Events are archived, never destroyed.** `DELETE` sets `deleted_at`; the
  Archive tab restores.

### Performance

The reason this calendar is standalone is so a student can open it and see
today's events immediately.

- The public landing page is **one request** (`/api/overview`).
- Administration is code-split; a public visitor never downloads it.
- A value-free `mrtc_session_hint` cookie lets the client skip the
  authentication request entirely when nobody is signed in.
- Public responses carry short `Cache-Control` lifetimes; admin responses are
  `no-store`.
- Identical in-flight requests are coalesced and results cached in memory, so
  switching calendar views or stepping back a month costs no round trip.
- Readiness and attachment counts are batched — no query-per-event.

First public load is roughly **95 KB gzipped** of JavaScript and CSS.

---

## Security

The interface hides what you cannot do; the **server decides** what you cannot
do. A missing button is never the control.

- scrypt password hashing; constant-time comparison; a dummy hash is computed
  for unknown emails so login timing reveals nothing.
- Server-side sessions stored as HMAC digests — a database leak cannot be
  replayed as a login. HttpOnly, SameSite=Lax, Secure in production, sliding
  12-hour expiry.
- Authorization on every mutating endpoint, plus `requireSuperAdmin` on account
  and organiser management.
- Quick Notes are scoped to their author in **every** statement. One admin
  cannot read another's, and neither can the Super Admin. Another admin's note
  reports "not found" rather than "forbidden", so the API never confirms it
  exists.
- Attachments are private by default. Downloads are authorized server-side and
  always sent as `Content-Disposition: attachment` with `nosniff`, so an
  uploaded HTML or SVG file cannot execute script on this origin.
- Internal events, internal responsibilities, event notes and activity history
  are filtered out of public responses at the serialization layer.
- CSRF: SameSite cookie + a required `X-Requested-With` header + origin check.
- Login throttling per IP and email. Deactivating an account or changing a
  password revokes its live sessions immediately.
- All SQL is parameterised; filter values are validated against allow-lists.
- Strict CSP, `nosniff`, frame-ancestors `none`, and no inline scripts.

---

## Product behaviour worth knowing

**Event readiness** is computed over *every* responsibility, for students and
admins alike. Deriving it from only the public subset would report an event as
"Ready" while internal preparation was still outstanding — a number consistent
with the list beneath it, but untrue. Where a public viewer sees fewer tasks
than the total, the page says so explicitly.

**Conflict warnings never block.** Double-booking a venue, or assigning a team
that is already busy at that hour, raises a warning that states the clash and
leaves the decision to the administrator. Cancelled events and completed tasks
never trigger one.

**Repeats are materialised.** Each occurrence becomes its own event, so a
single week can be moved or cancelled without touching the series.

**My Tasks means yours.** Only responsibilities assigned to your account
appear; team-owned work is tracked on the event and in Event Readiness, which
keeps the page a short personal list rather than a copy of every task.

---

## API

All routes are under `/api`. Mutating requests need the
`X-Requested-With: mrtc-calendar` header.

### Public

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness |
| `GET` | `/overview` | Whole landing page in one request |
| `GET` | `/events` | Calendar and list, with filters and paging |
| `GET` | `/events/:id` | Event detail |
| `GET` | `/meta` | Organisers, venues, taxonomy |
| `GET` | `/search?q=` | Global search |
| `GET` | `/attachments/:id/download` | Public files only |

`GET /events` accepts `from`, `to`, `q`, `source`, `organizer_id`,
`event_type`, `status`, `important`, `deadlines`, `limit`, `offset`.

### Administrator

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/auth/login`, `/auth/logout`, `/auth/password` | Session and password |
| `GET` | `/auth/me` | Current administrator |
| `POST` `PATCH` `DELETE` | `/events`, `/events/:id` | Create, edit, archive |
| `POST` | `/events/:id/restore`, `/events/:id/duplicate` | Restore, duplicate |
| `POST` | `/events/check-conflicts` | Warn while the form is filled in |
| `GET` | `/events/:id/activity` | Event history |
| `POST` | `/events/:eventId/responsibilities` | Add a responsibility |
| `PATCH` `DELETE` | `/responsibilities/:id` | Update, remove |
| `GET` | `/tasks/mine` | My Tasks |
| `GET` `POST` `PATCH` `DELETE` | `/notes`, `/notes/:id` | Private Quick Notes |
| `POST` | `/notes/:id/convert` | Note → responsibility |
| `POST` | `/events/:eventId/notes` | Event notes |
| `PATCH` `DELETE` | `/event-notes/:id` | Edit, remove |
| `POST` | `/events/:eventId/attachments` | Upload |
| `PATCH` `DELETE` | `/attachments/:id` | Publish, remove |
| `GET` | `/admin/archive`, `/admin/activity` | Archive, recent changes |
| `GET` | `/meta/assignees` | Teams and administrators |

### Super Admin only

`POST` `PATCH` `DELETE` on `/meta/organizations` and `/meta/venues`;
`GET` `POST` `PATCH` `DELETE` on `/admin/users`; `GET /admin/settings`.

### Errors

Always a readable sentence, never a bare status code:

```json
{ "error": { "code": "conflict",
              "message": "Seminar Hall is already booked from 4:00 PM to 6:00 PM for \"MRTC Technical Workshop\".",
              "details": { "conflicts": [ … ], "can_override": true } } }
```

---

## Routes

```
/                     Overview — today, deadlines, upcoming
/calendar             Month · Week · Day · Agenda
/events               Searchable, filterable list
/events/:id           Event details
/upcoming             Everything coming up
/login                Administrator sign-in

/admin                Admin overview
/admin/tasks          My Tasks
/admin/notes          Quick Notes (private)
/admin/events/new     Create event
/admin/events/:id/edit
/admin/manage         Organisers · Venues · Administrators · Archive
/admin/account        Password and appearance
```

---

## Design

Restrained and institutional: neutral surfaces, one MRTC accent, and colour
used to carry meaning rather than decoration — five hues for where an event
comes from (MRTC, department, academic, club, other), amber for deadlines, and
green/amber/red for readiness and status. Light and dark are two intentional
palettes, not one inverted; the theme follows the system by default and is
applied before first paint so there is no flash.

Desktop leads with the calendar grid. Phones default to Agenda, because a dense
month grid is hard to use there, and get a simplified bottom navigation.

---

## Ready for later, not built yet

The API is deliberately self-contained so it can sit behind the Club Infin8
backend without rework: shared authentication, a dashboard calendar widget,
Google/Outlook sync, registration, QR attendance, notifications and analytics
all fit the existing model. None of it is built, and none of it should be until
it is actually needed.
