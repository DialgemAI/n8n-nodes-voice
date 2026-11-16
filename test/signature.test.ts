import assert from 'node:assert/strict';
import { test } from 'node:test';

import { digest, verifySignature } from '../nodes/DialgemTrigger/signature';

// Produced by Dialgem's own signer (services/agent/app/agent/signing.py), not by this package.
const SECRET = 'whsec_test_secret';
const BODY = Buffer.from('{"id":"e1","type":"call_ended","created_at":"2026-01-01T12:00:00Z","data":{"note":"café ✓"}}', 'utf8');
const TS = 1767268800000;
const HEADER = `v=${TS},d=894d1ad403f0c59ff93e33dc59135e504f679618b987addcbf04284b10613034`;

test('matches a signature made by the Dialgem server, non-ASCII body included', () => {
	assert.equal(digest(SECRET, BODY, TS), HEADER.split('d=')[1]);
	assert.equal(verifySignature({ secret: SECRET, body: BODY, header: HEADER, nowMs: TS + 1000 }), true);
});

test('rejects a changed body, a wrong secret and a changed timestamp', () => {
	const now = TS + 1000;
	assert.equal(verifySignature({ secret: SECRET, body: Buffer.concat([BODY, Buffer.from(' ')]), header: HEADER, nowMs: now }), false);
	assert.equal(verifySignature({ secret: 'other', body: BODY, header: HEADER, nowMs: now }), false);
	const moved = HEADER.replace(`v=${TS}`, `v=${TS + 1}`);
	assert.equal(verifySignature({ secret: SECRET, body: BODY, header: moved, nowMs: now }), false);
});

test('rejects a signature outside five minutes either way, accepts one just inside', () => {
	const edge = 5 * 60 * 1000;
	assert.equal(verifySignature({ secret: SECRET, body: BODY, header: HEADER, nowMs: TS + edge }), true);
	assert.equal(verifySignature({ secret: SECRET, body: BODY, header: HEADER, nowMs: TS + edge + 1 }), false);
	assert.equal(verifySignature({ secret: SECRET, body: BODY, header: HEADER, nowMs: TS - edge }), true);
	assert.equal(verifySignature({ secret: SECRET, body: BODY, header: HEADER, nowMs: TS - edge - 1 }), false);
});

test('rejects a missing secret, a missing or malformed header', () => {
	const now = TS;
	assert.equal(verifySignature({ secret: '', body: BODY, header: HEADER, nowMs: now }), false);
	assert.equal(verifySignature({ secret: SECRET, body: BODY, header: undefined, nowMs: now }), false);
	assert.equal(verifySignature({ secret: SECRET, body: BODY, header: '', nowMs: now }), false);
	assert.equal(verifySignature({ secret: SECRET, body: BODY, header: 'garbage', nowMs: now }), false);
	assert.equal(verifySignature({ secret: SECRET, body: BODY, header: `v=${TS},d=abcd`, nowMs: now }), false);
});

test('tolerates header case and surrounding spaces like the server does', () => {
	assert.equal(verifySignature({ secret: SECRET, body: BODY, header: `  ${HEADER.toUpperCase()} `, nowMs: TS }), true);
});

test('a signature made with an empty secret is never accepted, even though it is a valid HMAC', () => {
	const header = `v=${TS},d=${digest('', BODY, TS)}`;
	assert.equal(verifySignature({ secret: '', body: BODY, header, nowMs: TS }), false);
});
