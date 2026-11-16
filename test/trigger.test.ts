import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DialgemTrigger } from '../nodes/DialgemTrigger/DialgemTrigger.node';
import { digest } from '../nodes/DialgemTrigger/signature';

type Call = { method: string; url: string; body?: unknown };

/** A stand-in for the object n8n passes as `this`, answering the HTTP calls from a script. */
function fake(opts: {
	event?: string;
	url?: string;
	stored?: Record<string, unknown>;
	replies?: Array<unknown | Error>;
	body?: Buffer;
	headers?: Record<string, string>;
	baseUrl?: string;
}) {
	const calls: Call[] = [];
	const replies = [...(opts.replies ?? [])];
	const stored = opts.stored ?? {};
	const sent: { status?: number; text?: string } = {};
	const ctx: any = {
		getWorkflowStaticData: () => stored,
		getNodeWebhookUrl: () => opts.url ?? 'https://n8n.example/webhook/abc/webhook',
		getNodeParameter: () => opts.event ?? 'call_ended',
		getCredentials: async () => ({ apiKey: 'k', baseUrl: opts.baseUrl ?? 'https://api.dialgem.com/' }),
		getNode: () => ({ name: 'Dialgem Trigger' }),
		helpers: {
			httpRequestWithAuthentication: async (_cred: string, o: any) => {
				calls.push({ method: o.method, url: o.url, body: o.body });
				const next = replies.shift();
				if (next instanceof Error) throw next;
				return next;
			},
			returnJsonArray: (j: unknown) => [{ json: j }],
		},
		getRequestObject: () => ({ rawBody: opts.body, headers: opts.headers ?? {} }),
		getResponseObject: () => ({
			status(code: number) {
				sent.status = code;
				return this;
			},
			send(text: string) {
				sent.text = text;
			},
		}),
		getBodyData: () => (opts.body ? JSON.parse(opts.body.toString('utf8')) : {}),
	};
	return { ctx, calls, stored, sent };
}

const methods = new DialgemTrigger().webhookMethods.default;

test('subscribing sends the webhook URL and event, and keeps the id and secret', async () => {
	const f = fake({ replies: [{ id: 'h1', secret: 'whsec_x', target_url: 'u', event: 'call_ended' }] });
	assert.equal(await methods.create.call(f.ctx), true);
	assert.deepEqual(f.calls, [
		{ method: 'POST', url: 'https://api.dialgem.com/v1/hooks/subscribe', body: { target_url: 'https://n8n.example/webhook/abc/webhook', event: 'call_ended' } },
	]);
	assert.deepEqual(f.stored, { hookId: 'h1', secret: 'whsec_x', url: 'https://n8n.example/webhook/abc/webhook', event: 'call_ended' });
});

test('an existing subscription without a secret is replaced so that we hold one', async () => {
	const f = fake({ replies: [{ id: 'old' }, { deleted: true }, { id: 'new', secret: 'whsec_new' }] });
	await methods.create.call(f.ctx);
	assert.deepEqual(f.calls.map((c) => `${c.method} ${c.url.replace('https://api.dialgem.com', '')}`), [
		'POST /v1/hooks/subscribe',
		'DELETE /v1/hooks/old',
		'POST /v1/hooks/subscribe',
	]);
	assert.equal(f.stored.hookId, 'new');
	assert.equal(f.stored.secret, 'whsec_new');
});

test('fails clearly when Dialgem never returns a secret', async () => {
	const f = fake({ replies: [{ id: 'a' }, {}, { id: 'b' }] });
	await assert.rejects(() => methods.create.call(f.ctx), /secret/);
});

test('a subscription counts as existing only with id, secret, address and event all matching', async () => {
	const url = 'https://n8n.example/webhook/abc/webhook';
	const full = { hookId: 'h', secret: 's', url, event: 'call_ended' };
	assert.equal(await methods.checkExists.call(fake({ stored: { ...full } }).ctx), true);
	assert.equal(await methods.checkExists.call(fake({ stored: { ...full, secret: undefined } }).ctx), false);
	assert.equal(await methods.checkExists.call(fake({ stored: { ...full, hookId: undefined } }).ctx), false);
	assert.equal(await methods.checkExists.call(fake({ stored: { ...full, url: 'https://elsewhere' } }).ctx), false);
	assert.equal(await methods.checkExists.call(fake({ stored: { ...full }, event: 'call_started' }).ctx), false);
	assert.equal(await methods.checkExists.call(fake({}).ctx), false);
});

test('unsubscribing deletes the hook and forgets it; with nothing stored it makes no call', async () => {
	const f = fake({ stored: { hookId: 'h1', secret: 's', url: 'u', event: 'e' }, replies: [{ deleted: true }] });
	assert.equal(await methods.delete.call(f.ctx), true);
	assert.deepEqual(f.calls, [{ method: 'DELETE', url: 'https://api.dialgem.com/v1/hooks/h1', body: undefined }]);
	assert.deepEqual(f.stored, {});
	const none = fake({});
	assert.equal(await methods.delete.call(none.ctx), true);
	assert.equal(none.calls.length, 0);
});

test('if Dialgem cannot be reached to unsubscribe, the stored subscription is kept for another try', async () => {
	const f = fake({ stored: { hookId: 'h1', secret: 's' }, replies: [new Error('network')] });
	assert.equal(await methods.delete.call(f.ctx), false);
	assert.equal(f.stored.hookId, 'h1');
});

const payload = Buffer.from(JSON.stringify({ id: 'e1', type: 'call_ended', created_at: '2026-01-01T12:00:00Z', data: { call_id: 'c1' } }));
const signed = (secret: string, body = payload, ts = Date.now()) => ({ 'x-dialgem-signature': `v=${ts},d=${digest(secret, body, ts)}` });

test('a correctly signed event starts the workflow with the whole envelope', async () => {
	const f = fake({ stored: { secret: 'whsec_x' }, body: payload, headers: signed('whsec_x') });
	const out: any = await new DialgemTrigger().webhook.call(f.ctx);
	assert.equal(f.sent.status, undefined);
	assert.deepEqual(out.workflowData[0][0].json, { id: 'e1', type: 'call_ended', created_at: '2026-01-01T12:00:00Z', data: { call_id: 'c1' } });
});

test('a wrong, missing, stale or unconfigured signature is answered 401 and starts nothing', async () => {
	const cases: Array<[string, Record<string, unknown>, Record<string, string>]> = [
		['wrong secret', { secret: 'whsec_x' }, signed('whsec_other')],
		['no header', { secret: 'whsec_x' }, {}],
		['stale', { secret: 'whsec_x' }, signed('whsec_x', payload, Date.now() - 10 * 60 * 1000)],
		['no secret stored', {}, signed('whsec_x')],
	];
	for (const [label, stored, headers] of cases) {
		const f = fake({ stored, body: payload, headers });
		const out: any = await new DialgemTrigger().webhook.call(f.ctx);
		assert.equal(f.sent.status, 401, label);
		assert.deepEqual(out, { noWebhookResponse: true }, label);
	}
});

test('the chosen event, not a default, is what gets subscribed', async () => {
	for (const event of ['call_started', 'call_analyzed']) {
		const f = fake({ event, replies: [{ id: 'h', secret: 's' }] });
		await methods.create.call(f.ctx);
		assert.equal((f.calls[0].body as { event: string }).event, event);
	}
});
