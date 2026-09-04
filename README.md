# wikiSneaks

Monorepo: user API (`server`) and a Vue 3 SPA scaffold (`web`). npm workspaces.

```
wikiSneaks/
├── server/     Express 5 + Prisma API (auth, users)
├── web/        Vue 3 + Vite (scaffold — no app UI yet)
└── package.json
```

## Requirements

- Node.js 22+ (web `engines` also allow ≥ 24.12)
- PostgreSQL ≥ 15
- npm 10+ (workspaces)

## Quick start

```sh
git clone <repo>
cd wikiSneaks
npm install

cp server/.env.example server/.env
# edit server/.env — DATABASE_URL, JWT_SECRET, peppers, token lifetimes

cd server
npx prisma migrate dev
cd ..

npm run dev          # API + web (see scripts below)
```

| Command           | What                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| `npm run dev`     | API (`tsx watch`) and Vite in parallel                                 |
| `npm run dev:api` | API only — [http://localhost:3000](http://localhost:3000) (`PORT`)     |
| `npm run dev:web` | SPA only — Vite default [http://localhost:5173](http://localhost:5173) |

API details, env, tests: **[server/README.md](server/README.md)**.  
Cookies / refresh / logout: **[server/docs/auth.md](server/docs/auth.md)**.  
Email fingerprints: **[server/docs/email-hashing.md](server/docs/email-hashing.md)**.

`web/` is still the Vite + Vue starter (`web/README.md`). There is no CORS setup and auth cookies are `SameSite=strict`, so the SPA on :5173 will not send cookies to the API on :3000 until you put them on the same site (proxy) or change cookie/CORS policy.

## TODO

### Next

- **Wiki entries** — `Entry` (text + attachments: docs/images), `/api/entries` CRUD, slug, author/roles.

### Soon

- **Session cap** — `MAX_REFRESH_SESSIONS`; drop oldest on login; optional logout-everywhere.
- **Change password** — `POST /api/auth/change-password`; revoke refresh (all or except current).
- **Rate limit** — `/login`, `/register`, `/refresh`.
- **Seed** — one ADMIN + one USER from `.env.example`.
- **Bind email HTTP** — `reconfirmEmail`, self only.
- **CORS or Vite proxy** — cookies from `web/` to the API.

### Later

- **Password reset** — after email bind.
- **Web auth UI** — after proxy/CORS.
- **Reuse-detection / token family** — replayed refresh revokes the family.
- **Redis refresh lock** — shared lock across instances.
- **Change role HTTP** — admin route; JWT `role` updates on refresh.
- **Access blacklist** — logout/block vs ~3 min access TTL.
