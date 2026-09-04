# Authentication

Sessions are **httpOnly cookies**, not `Authorization: Bearer`. Tokens are never returned in JSON.

## Cookies

| Cookie | Path | Lifetime | Notes |
| --- | --- | --- | --- |
| `accessToken` | `/` (default) | `MAX_AGE_ACCESS_TOKEN_MILLISECONDS` | Sent on `/api/users/*`. |
| `refreshToken` | `/api/auth` | `MAX_AGE_REFRESH_TOKEN_MILLISECONDS` | Browser sends it only to register/login/refresh/logout. |

Shared flags: `httpOnly`, `sameSite=strict`. `secure` is on only when `NODE_ENV=production`.

`DELETE /api/auth/logout` must `clearCookie` with the same `path` / `sameSite` / `secure` as the setter, or the browser keeps the refresh cookie.

## Endpoints

All under `/api/auth`.

### `POST /register`

Body: `{ login, password }` (same rules as `registerBodySchema`). Email in the body is ignored.

- **201** `{ message: "Registration successful" }` + both cookies
- **400** validation
- **409** `{ message: "Login is already registered" }`

Creates one `ws_refresh_token` row (`jti` + `expiresAt`).

### `POST /login`

Body: `{ login, password }`.

- **200** `{ message: "Login successful" }` + both cookies
- **401** `{ message: "Invalid login or password" }`
- **403** `{ message: "Account is blocked" }`

Each login inserts a **new** refresh row (multiple devices). That is intentional until the session cap (`MAX_REFRESH_SESSIONS` in the root README TODO / Soon). Expired rows for that user are deleted after the insert.

Unknown logins still run argon2 against `DUMMY_PASSWORD_HASH` so timing does not leak whether the login exists.

### `POST /refresh`

Reads `refreshToken` cookie. Rotates `jti` in place and sets new cookies.

- **200** `{ message: "Refresh successful" }`
- **401** `{ message: "No refresh token provided" }` — cookie missing
- **401** `{ message: "Unauthorized" }` — JWT invalid/expired/wrong type (`JsonWebTokenError`)
- **401** `{ message: "Invalid refresh token" }` — user row gone
- **401** `{ message: "Refresh token not found" }` — `jti` not in DB (reuse after rotation, or revoked)
- **403** `{ message: "Account is blocked" }`

### `DELETE /logout`

Idempotent. Deletes the `jti` if the cookie is a known refresh JWT, then clears both cookies.

- **200** `{ message: "Logout successful" }` even when the cookie is missing or garbage

Logout does **not** blacklist the access JWT. It stays valid until `exp`.

## JWT payloads

HS256, secret `JWT_SECRET`. `type` is required so an access token cannot be used as refresh and vice versa.

Access: `{ userId, login, role, type: "access" }` plus `iat` / `exp`. No `jti` — two access tokens issued in the same Unix second can be byte-identical.

Refresh: `{ userId, type: "refresh", jti }` (`jti` is a UUID stored in `ws_refresh_token`).

## Refresh rotation and the in-memory cache

`refresh` updates the existing row (`jti` + `expiresAt`), it does not insert a second row.

Concurrent refreshes of the **same** `jti` share one in-flight promise in `token.cache` (LRU, max 100_000, TTL 3s). After the TTL, a replay of the old JWT hits `P2025` → `Refresh token not found`.

The cache is process-local. Two API instances can both rotate the same `jti`; the second writer gets `Refresh token not found`.

## Block / unblock

`POST /api/users/:userId/block` (admin only) deletes **every refresh row** for that user, then sets `isBlocked`. `/unblock` only clears the flag — it does not touch remaining tokens.

A blocked user who still holds a refresh cookie gets **403** on `/refresh` (user is loaded before the `jti` update). Login is also **403**. The access cookie still works until it expires. After unblock the user must log in again if block already wiped their refresh rows.

## Cleanup

`0 0 * * *` (midnight, server local time) runs `deleteExpiredRefreshTokens` (`expiresAt < now()`). Login also deletes expired rows for that user only.

User delete cascades tokens (`onDelete: Cascade`).

## Env

See `.env.example`.

| Variable | Role |
| --- | --- |
| `JWT_SECRET` | HS256 key |
| `MAX_AGE_ACCESS_TOKEN_MILLISECONDS` | Access cookie and JWT `exp` |
| `MAX_AGE_REFRESH_TOKEN_MILLISECONDS` | Refresh cookie, JWT `exp`, and `expiresAt` on insert/rotate |
| `NODE_ENV` | `production` → `Secure` cookies; `test` → no morgan |

Lifetimes are milliseconds in env, seconds in `jwt.sign` (`expiresIn: ms / 1000`).
