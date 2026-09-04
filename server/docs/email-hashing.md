# Email hashing

Plaintext emails are never stored. Registration does **not** bind an email; `email_hash` / `email_pepper_version` stay null until a later opt-in (`auth.service` `reconfirmEmail`, not exposed as an HTTP route yet).

## Algorithm

HMAC-SHA256 of a **normalized** address (callers must trim + lowercase) with a versioned pepper. Digest is 64 hex chars (`Char(64)` on `ws_user.email_hash`).

## Env

| Variable | Role |
| --- | --- |
| `EMAIL_HASH_PEPPERS` | JSON object `{ "1": "secret", "2": "…" }`. Versions must be integers ≥ 1. |
| `EMAIL_HASH_PEPPER_CURRENT` | Version used for new hashes. Must be a key in the map. If unset, the max key is used. |
| `EMAIL_HASH_PEPPER` | Legacy single secret, treated as version **1**. Used only when `EMAIL_HASH_PEPPERS` is unset. |

Keep old peppers in env until every row is upgraded to `CURRENT`, then drop them. Lookup hashes the candidate under **every** live pepper (`hashEmailAllVersions`).

`isStalePepperVersion` is true when the stored version is not current. `upgradeEmailHash` rewrites the fingerprint and sets `isEmailVerified`.

Tests (`.env.test.example`) ship two peppers so rotation / stale-hash cases can run.
