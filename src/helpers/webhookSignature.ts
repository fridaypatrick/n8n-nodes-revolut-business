import crypto from 'node:crypto';

import { REVOLUT_REQUEST_TIMESTAMP_HEADER_NAME, REVOLUT_SIGNATURE_HEADER_NAMES } from './constants';

const REVOLUT_SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;
const SHA256_HEX_HMAC_PATTERN = /^[a-f0-9]{64}$/i;

export interface VerificationResult {
	verified: boolean;
	reason?: string;
	algorithm?: string;
}

export function verifyWebhookSignature(
	rawBody: string,
	signingSecret: string | undefined,
	headers: Record<string, string>,
	options: { now?: number } = {},
): VerificationResult {
	if (!signingSecret) {
		return { verified: false, reason: 'No signing secret configured' };
	}

	const timestamp = headers[REVOLUT_REQUEST_TIMESTAMP_HEADER_NAME];
	if (!timestamp) {
		return { verified: false, reason: 'No Revolut request timestamp header found' };
	}

	if (!/^\d+$/.test(timestamp)) {
		return { verified: false, reason: 'Invalid Revolut request timestamp' };
	}

	const timestampMs = Number(timestamp);
	if (!Number.isSafeInteger(timestampMs)) {
		return { verified: false, reason: 'Invalid Revolut request timestamp' };
	}

	const now = options.now ?? Date.now();
	if (timestampMs < now - REVOLUT_SIGNATURE_TOLERANCE_MS) {
		return { verified: false, reason: 'Stale Revolut request timestamp' };
	}

	if (timestampMs > now + REVOLUT_SIGNATURE_TOLERANCE_MS) {
		return { verified: false, reason: 'Future Revolut request timestamp outside tolerance' };
	}

	const signatureHeader = REVOLUT_SIGNATURE_HEADER_NAMES.map((headerName) => headers[headerName]).find(Boolean);
	if (!signatureHeader) {
		return { verified: false, reason: 'No Revolut signature header found' };
	}

	const signatures = extractRevolutSignatures(signatureHeader);
	if (!signatures.length) {
		return { verified: false, reason: 'No supported Revolut signature value found' };
	}

	const signedPayload = `v1.${timestamp}.${rawBody}`;
	const digest = crypto.createHmac('sha256', signingSecret).update(signedPayload).digest('hex');
	const digestBuffer = Buffer.from(digest, 'utf8');
	const verified = signatures.some((signature) => {
		const signatureBuffer = Buffer.from(signature, 'utf8');
		return digestBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(digestBuffer, signatureBuffer);
	});

	return {
		verified,
		algorithm: 'hmac-sha256-v1-timestamp-hex',
		reason: verified
			? undefined
			: 'Computed HMAC did not match any provided Revolut signature',
	};
}

export function extractRevolutSignatures(signatureHeader: string): string[] {
	return signatureHeader
		.split(',')
		.map((part) => part.trim())
		.map((part) => part.startsWith('v1=') ? part.slice(3).trim() : part)
		.filter((part) => SHA256_HEX_HMAC_PATTERN.test(part))
		.map((part) => part.toLowerCase());
}
