import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Dialgem signs every webhook with `X-Dialgem-Signature: v=<timestamp_ms>,d=<hex>` where
 * `hex = HMAC-SHA256(secret, rawBody + String(timestamp_ms))`. The timestamp is part of the signed
 * message, so a captured request cannot be replayed with a fresh one; a request more than five minutes
 * from our clock is refused.
 */
export const DEFAULT_TOLERANCE_MS = 5 * 60 * 1000;

const HEADER = /^v=(\d{10,16}),d=([0-9a-f]{64})$/;

export function digest(secret: string, body: Buffer, timestampMs: number): string {
	return createHmac('sha256', secret)
		.update(Buffer.concat([body, Buffer.from(String(timestampMs), 'ascii')]))
		.digest('hex');
}

export function verifySignature(opts: {
	secret: string;
	body: Buffer;
	header: string | undefined;
	nowMs?: number;
	toleranceMs?: number;
}): boolean {
	const { secret, body, header } = opts;
	if (!secret || !header) return false;
	const match = HEADER.exec(header.trim().toLowerCase());
	if (!match) return false;
	const timestamp = Number(match[1]);
	const now = opts.nowMs ?? Date.now();
	if (Math.abs(now - timestamp) > (opts.toleranceMs ?? DEFAULT_TOLERANCE_MS)) return false;
	const expected = Buffer.from(digest(secret, body, timestamp), 'hex');
	const given = Buffer.from(match[2], 'hex');
	return expected.length === given.length && timingSafeEqual(expected, given);
}
