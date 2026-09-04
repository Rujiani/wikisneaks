# server

Express 5 API for wikiSneaks: registration, cookie sessions, and user CRUD with roles.

PostgreSQL via Prisma 7 (`@prisma/adapter-pg`). ESM (`"type": "module"`).

## Stack

| Layer | Choice |
| --- | --- |
| HTTP | Express 5, `cookie-parser`, morgan |
| Validation | Zod 4 |
| DB | PostgreSQL ≥ 15, Prisma 7 |
| Passwords | argon2id |
| Sessions | HS256 JWT in **httpOnly cookies** (not `Authorization: Bearer`) |
| Tests | Vitest + SuperTest against a dedicated `test_db` |

## Requirements

- Node.js 22+
- PostgreSQL ≥ 15
- npm (run commands from this directory unless noted)

## Setup

```sh
cp .env.example .env
# fill DATABASE_URL, JWT_SECRET, EMAIL_HASH_PEPPERS, token max-ages

npx prisma migrate dev    # apply migrations + generate client
npm run dev               # tsx watch, default http://localhost:3000
```

`postinstall` already runs `prisma generate`. Re-run it after schema changes if you are not using `migrate dev`.

| Script | What |
| --- | --- |
| `npm run dev` | Watch mode |
| `npm run build` | `tsc` → `dist/` |
| `npm start` | `node dist/index.js` (needs `build` first) |
| `npm run test:migrate` | `prisma db push` on `.env.test` (sync schema, skip migration history) |
| `npm run test:migrate:deploy` | `prisma migrate deploy` on `.env.test` (same path as prod) |
| `npm test` | Vitest once |
| `npm run test:watch` | Vitest watch |

Process signals: `SIGINT` / `SIGTERM` close the HTTP server and the pg pool (10s force-exit). A daily cron (`0 0 * * *`, server local midnight) deletes expired refresh rows.

## Environment

Copy `.env.example`. Prisma loads it through `prisma.config.ts` (`import "dotenv/config"`). The app loads it in `src/index.ts` / `src/prisma/db.ts`.

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres URL. Hosts containing `localhost` / `127.0.0.1` skip TLS; anything else uses `ssl: { rejectUnauthorized: true }`. |
| `PORT` | no | Default `3000`. |
| `NODE_ENV` | no | `development` → morgan `dev`; `production` → morgan `tiny` **and** `Secure` cookies; `test` → no morgan. |
| `JWT_SECRET` | yes | HS256 key. Use a long random value (`openssl rand -base64 32`). |
| `MAX_AGE_ACCESS_TOKEN_MILLISECONDS` | yes | Access cookie + JWT `exp` (number, milliseconds). |
| `MAX_AGE_REFRESH_TOKEN_MILLISECONDS` | yes | Refresh cookie, JWT `exp`, and `ws_refresh_token.expires_at`. |
| `EMAIL_HASH_PEPPERS` | yes* | JSON `{ "1": "secret", … }`. See [docs/email-hashing.md](docs/email-hashing.md). |
| `EMAIL_HASH_PEPPER_CURRENT` | no | Version for new hashes; default = max key in the map. |
| `EMAIL_HASH_PEPPER` | no | Legacy single secret (version 1) if `EMAIL_HASH_PEPPERS` is unset. |

\*Either `EMAIL_HASH_PEPPERS` or legacy `EMAIL_HASH_PEPPER`.

JWT lifetimes in env are **milliseconds**; `jwt.sign` gets `expiresIn` in **seconds** (`ms / 1000`). Invalid / missing max-ages throw at import time.

Do not commit `.env` or `.env.test`.

## Layout

```
src/
  index.ts              listen, shutdown, expired-token cron
  app.ts                middleware, /health, /api, error handler
  routes/               auth + users
  controllers/          parse request, set cookies, status codes
  services/             business rules
  repositories/         Prisma
  middleware/           authenticate, roles, refresh-token LRU cache
  schemas/              Zod
  utils/                JWT, argon2, email HMAC, http-errors
  prisma/db.ts          Pool + PrismaClient
prisma/
  schema.prisma
  migrations/
docs/
  auth.md
  email-hashing.md
__tests__/
```

Flow: **route → controller → service → repository**. Controllers do not talk to Prisma.

## HTTP

Base URL: `http://localhost:3000` (or `PORT`).

JSON in, JSON out (`Content-Type: application/json`). Sessions are cookies; send `credentials` if the client is a browser on the **same site**. There is no CORS middleware.

### Errors

| Status | Body |
| --- | --- |
| 400 | `{ message: "Validation error", issues: ZodIssue[] }` |
| 401 / 403 / 404 | `{ message: string }` |
| 401 | `{ message: "Unauthorized" }` for missing access cookie or any `JsonWebTokenError` (bad/expired/wrong-type JWT) |
| 409 | `{ message: "Login is already registered" }` from `POST /api/auth/register` |
| 500 | `{ message: "Internal server error" }` |

### Health

`GET /health` → `200` text `app is running perfectly` (no auth).

### Auth — `/api/auth`

Tokens are **never** in JSON. Register/login/refresh set `accessToken` and `refreshToken` cookies. Details, status matrix, rotation, and cache: **[docs/auth.md](docs/auth.md)**.

| Method | Path | Auth | Success |
| --- | --- | --- | --- |
| `POST` | `/register` | no | **201** `{ message }` + cookies |
| `POST` | `/login` | no | **200** `{ message }` + cookies |
| `POST` | `/refresh` | refresh cookie | **200** `{ message }` + new cookies |
| `DELETE` | `/logout` | optional | **200** `{ message }`, cookies cleared |

**Register body** `{ login, password }`:

- `login` — 5–64 chars, Latin, must start with a letter, then `[a-zA-Z0-9._-]`; trimmed
- `password` — ≥ 12 chars, at least one lower, upper, digit, special
- Extra fields (e.g. `email`) are stripped; email is **not** stored at registration

**Login body** `{ login, password }` (no password-policy check). Unknown logins still verify against a dummy argon2 hash so timing does not leak existence.

### Users — `/api/users`

All routes require a valid **access** cookie. Role checks use the JWT payload (`req.user`), not a fresh DB read.

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| `GET` | `/` | `ADMIN`, `MODERATOR` | Query `limit` (1–100, default 20), `offset` (≥ 0, default 0). Newest first (`id` desc). `{ users }` |
| `GET` | `/:userId` | owner, `ADMIN`, `MODERATOR` | `{ user }` |
| `PATCH` | `/:userId` | owner, `ADMIN` | Body `{ extraInfo }` (trim, max 1000). Other fields ignored. `{ user }` |
| `DELETE` | `/:userId` | owner, `ADMIN` | **204**, empty body. Tokens cascade-delete. |
| `POST` | `/:userId/block` | `ADMIN` | Not self. Drops **all** refresh rows, then `isBlocked: true`. `{ user }` |
| `POST` | `/:userId/unblock` | `ADMIN` | `isBlocked: false` only — does not delete tokens. `{ user }` |

`userId` is a positive integer (coerced from the path).

**Public user** (never `passwordHash` / `email` / `emailHash`):

```json
{
  "id": 1,
  "login": "sneakerfan",
  "extraInfo": null,
  "role": "USER",
  "isBlocked": false,
  "createdAt": "…",
  "updatedAt": "…"
}
```

`role` is `USER` | `ADMIN` | `MODERATOR`. There is no HTTP route to change role; seed/update in the DB.

A blocked account cannot log in or refresh (**403** `Account is blocked`). An access JWT issued before the block remains valid until `exp`.

## Database

Prisma schema: `prisma/schema.prisma`. Mapped tables: `ws_user`, `ws_refresh_token`, enum `ws_role`.

The schema that ships to production is **`prisma/migrations/`**, not a live diff of `schema.prisma`.

| Command | What |
| --- | --- |
| `npx prisma migrate dev --name <name>` | Local: create a migration from schema drift, apply it, generate the client. Interactive; not for prod. |
| `npx prisma migrate deploy` | Apply pending files from `prisma/migrations/`. No new files, no shadow DB. CI / staging / prod. |
| `npx prisma migrate status` | What is applied vs pending. |
| `npx prisma db push` | Force the database to match `schema.prisma` **without** running migrations. Fast for a throwaway DB. |
| `npx prisma studio` | Browse data. |

```sh
npx prisma migrate dev --name <name>   # you, locally, after a schema change
npx prisma migrate deploy              # CI / prod — this is the history that must apply
```

`db push` can leave tests green while `migrate deploy` fails (forgotten migration SQL, drift). Green tests do **not** prove migrations apply. Refresh rows: unique `jti`, `expiresAt`, `onDelete: Cascade` from user. See [docs/auth.md](docs/auth.md).

## Tests

Use a **separate** database. `.env.test` must contain `test_db` in `DATABASE_URL` or CRUD/auth suites refuse to run.

`.env.test.example` uses port **5433** so tests can sit beside a dev server on 5432.

Locally, `test:migrate` (`db push`) is enough to get a schema under the tests. That does **not** exercise `prisma/migrations/`. Before a real commit / on CI, also apply the same path prod will use:

```sh
cp .env.test.example .env.test
# DATABASE_URL → your test instance, e.g. postgresql://…@localhost:5433/test_db

npm run test:migrate           # local: push schema.prisma
npm run test:migrate:deploy    # CI/prod-shaped: run migration files
npm test
```

Suites: HTTP CRUD (`crud.spec.ts`), sessions (`auth.spec.ts`), cookie/JWT without DB (`auth.http.spec.ts`), Zod schemas, JWT helpers, email peppers. Tests truncate `ws_refresh_token` and `ws_user`.

## Docs

- [Authentication](docs/auth.md) — cookies, JWT shapes, refresh rotation, cache, block, cron
- [Email hashing](docs/email-hashing.md) — HMAC peppers; binding is not an HTTP route yet (`reconfirmEmail` in `auth.service`)
- [Roadmap / TODO](../README.md#todo) — articles next; session cap, email HTTP, CORS; later reuse-detection / Redis / role HTTP
