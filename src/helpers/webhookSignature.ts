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

	const signatureHeader = REVOLUT_SIGNATURE_HEADER_NAMES.map((headerName) => headers[headerName]).find(Boolean);
	if (!signatureHeader) {
		return { verified: false, reason: 'No Revolut signature header found' };
	}

	const signatures = extractRevolutSignatures(signatureHeader);
	if (!signatures.length) {
		return { verified: false, reason: 'No supported Revolut signature value found' };
	}

	const digest = crypto.createHmac('sha256', signingSecret).update(rawBody).digest('hex');
	const digestBuffer = Buffer.from(digest, 'utf8');
	const verified = signatures.some((signature) => {
		const signatureBuffer = Buffer.from(signature, 'utf8');
		return digestBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(digestBuffer, signatureBuffer);
	});

	return {
		verified,
		algorithm: 'hmac-sha256-hex',
		reason: verified
			? undefined
			: 'Computed HMAC did not match any provided Revolut signature',
	};
}

export function extractRevolutSignatures(signatureHeader: string): string[] {
	return signatureHeader
		.split(',')
		.map((part) => part.trim())
		.map((part) => part.startsWith('v1=') ? part.slice(3) : part)
		.map((part) => part.trim().toLowerCase())
		.filter(Boolean);
}
