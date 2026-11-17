# Changelog

## 0.1.1

No change to the node. This release is published from GitHub Actions, so it carries npm provenance, which `0.1.0` (published by hand) does not.

## 0.1.0

First release.

### Added
- **Dialgem Trigger** node: starts a workflow when a call starts, ends or has been analyzed. Activating the workflow subscribes to Dialgem; deactivating removes the subscription.
- Each run receives `{ id, type, created_at, data }`. `id` is stable, so it can be used to de-duplicate.
- Every request is checked against its `X-Dialgem-Signature` (HMAC-SHA256 over the raw body plus the timestamp, five minute tolerance) with Node's built-in `crypto`. An unsigned, forged or stale request is answered 401 and starts nothing.
- **Dialgem API** credential: an API key with the webhooks permission. The credential test calls `GET /v1/hooks/me`.
- No runtime dependencies.
