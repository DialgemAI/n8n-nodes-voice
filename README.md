# n8n-nodes-dialgem

An [n8n](https://n8n.io) trigger node for [Dialgem](https://dialgem.com): start a workflow when a call starts, ends, or has been analyzed.

## Use

1. In Dialgem, create an API key (Settings, API keys) with the webhooks permission.
2. In n8n add the **Dialgem API** credential with that key.
3. Add the **Dialgem Trigger** node and choose an event. Activating the workflow subscribes to it; deactivating removes it.

Each run receives `{ id, type, created_at, data }`. `id` is stable, so use it to de-duplicate.

## How it works

The node calls `POST /v1/hooks/subscribe` with the workflow's webhook URL and keeps the signing secret Dialgem returns. Every request is checked with `X-Dialgem-Signature` (HMAC-SHA256 over the raw body plus the timestamp, five minute tolerance) using Node's built-in `crypto`; anything unsigned or stale is answered 401. There are no runtime dependencies.

## Develop

```
npm install
npm test        # compiles, then runs the tests
npm run build
```

## Release

Bump `version` in `package.json`, add a CHANGELOG entry, merge to `main`, then push a matching tag:

```
git tag v0.1.0 && git push origin v0.1.0
```

The Release workflow checks that the tagged commit is on `main` and that the tag matches `package.json`, runs the tests, checks the package contents, and publishes to npm with provenance. A version with a hyphen (`0.2.0-beta.1`) publishes to the `next` dist-tag. The workflow runs in the `npm` GitHub environment, where required reviewers can gate each release.

MIT licensed.
