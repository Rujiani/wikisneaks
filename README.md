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

- **Wiki domain (articles).** Auth/users are the platform; the product is still missing. Next slice: `Article` (title, slug, body, author → user, timestamps), CRUD under `/api/articles`, who can create/edit (owner / `MODERATOR` / `ADMIN`), list + get by slug. Keep it boring until that loop works, then drafts/revisions. Wiki **UI** waits on proxy/CORS (Soon) and web auth (Later).

### Soon

- **Session cap.** Env `MAX_REFRESH_SESSIONS` (e.g. `5`). Until then, every login keeps a new refresh row on purpose (multi-device, no cap). On **login**: insert the new refresh row, then if that user has more than N rows, delete the oldest (`ORDER BY created_at ASC`). **Register** usually has 1 row — the cap does not fire. Optional: `DELETE /api/auth/sessions` («log out everywhere») = `deleteMany` by `userId` except the current `jti`.
- **Change password.** `POST /api/auth/change-password` `{ currentPassword, newPassword }`. Revoke all refresh rows, or all except the current `jti`. Access JWT lives until `exp` (same as logout).
- **Rate limit** `/login` and `/register` (and a softer cap on `/refresh`). In-memory per process is enough. Without this, auth looks “done” and brute force is wide open.
- **Seed.** One `ADMIN` + one `USER` with known passwords from `.env.example` (not prod secrets). Manual checklist after migrate is painful without it.
- **Bind email over HTTP.** `reconfirmEmail` exists only in `auth.service`. Add a route, **self** only (owner of `:userId` / the access cookie). See [server/docs/email-hashing.md](server/docs/email-hashing.md).
- **CORS or Vite proxy for** `web/`**.** Pick **one** and write it down: proxy `/api` to `:3000` (same site → `SameSite=strict` works), **or** relax cookies (`SameSite=none` + `Secure`) and enable CORS with credentials. Cross-origin SPA on `:5173` is dead until then.

### Later

- **Password reset by email.** Only after HTTP bind email — otherwise there is nowhere to send the mail.
- **Web auth UI.** After proxy/CORS.
- **Reuse-detection / token family.** If an old refresh `jti` is used after rotation (and outside the 3s cache), treat it as theft: revoke the whole family / all sessions for that user, not only `Refresh token not found`.
- **Redis / shared refresh lock.** The in-memory LRU is per process. More than one API instance can rotate the same `jti` twice. A shared lock (or sticky sessions) is the fix.
- **Change role over HTTP.** Roles are DB-only today. An admin route (not self) to set `USER` / `MODERATOR` / `ADMIN`. Remember: the access JWT still has the old `role` until refresh.
- **Access token blacklist** on logout/block. Skip while access lifetime is ~3 minutes. Same as logout today: access lives until `exp`.
