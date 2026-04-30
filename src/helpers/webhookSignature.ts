import crypto from 'node:crypto';

import { REVOLUT_SIGNATURE_HEADER_NAMES } from './constants';

export interface VerificationResult {
	verified: boolean;
	reason?: string;
	algorithm?: string;
}

export function verifyWebhookSignature(
	rawBody: string,
	signingSecret: string | undefined,
	headers: Record<string, string>,
): VerificationResult {
	if (!signingSecret) {
		return { verified: false, reason: 'No signing secret configured' };
	}

	const signature = REVOLUT_SIGNATURE_HEADER_NAMES.map((headerName) => headers[headerName]).find(Boolean);
	if (!signature) {
		return { verified: false, reason: 'No Revolut signature header found' };
	}

	const normalisedSignature = signature.trim().toLowerCase();
	const digest = crypto.createHmac('sha256', signingSecret).update(rawBody).digest('hex');
	const digestBuffer = Buffer.from(digest, 'utf8');
	const signatureBuffer = Buffer.from(normalisedSignature, 'utf8');
	const verified = digestBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(digestBuffer, signatureBuffer);

	return {
		verified,
		algorithm: 'hmac-sha256-hex',
		reason: verified
			? undefined
			: 'Computed HMAC did not match provided signature; helper currently assumes Revolut sends a lowercase hex HMAC over the raw body',
	};
}
