import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';

import { verifyWebhookSignature } from '../src/helpers/webhookSignature';

const now = 1_700_000_000_000;

function createOfficialSignature(rawBody: string, secret: string, timestamp: string): string {
	return crypto.createHmac('sha256', secret).update(`v1.${timestamp}.${rawBody}`).digest('hex');
}

test('verifies valid official Revolut signature using timestamped payload', () => {
	const rawBody = JSON.stringify({ event: 'TransactionCreated' });
	const secret = 'wsk_test_secret';
	const timestamp = String(now);
	const signature = createOfficialSignature(rawBody, secret, timestamp);

	const result = verifyWebhookSignature(rawBody, secret, {
		'revolut-request-timestamp': timestamp,
		'revolut-signature': `v1=${signature}`,
	}, { now });

	assert.equal(result.verified, true);
});

test('verifies official v1 Revolut signature header format', () => {
	const rawBody = JSON.stringify({ event: 'TransactionCreated' });
	const secret = 'wsk_test_secret';
	const timestamp = String(now);
	const signature = createOfficialSignature(rawBody, secret, timestamp);

	const result = verifyWebhookSignature(rawBody, secret, {
		'revolut-request-timestamp': timestamp,
		'revolut-signature': `v1=${signature}`,
	}, { now });

	assert.equal(result.verified, true);
});

test('verifies one of multiple comma-separated Revolut signatures', () => {
	const rawBody = JSON.stringify({ event: 'TransactionCreated' });
	const secret = 'wsk_test_secret';
	const timestamp = String(now);
	const signature = createOfficialSignature(rawBody, secret, timestamp);

	const result = verifyWebhookSignature(rawBody, secret, {
		'revolut-request-timestamp': timestamp,
		'revolut-signature': `v1=bad, v1=${signature}`,
	}, { now });

	assert.equal(result.verified, true);
});

test('fails with no supported signature value when only unsupported tokens are provided', () => {
	const result = verifyWebhookSignature('{}', 'wsk_test_secret', {
		'revolut-request-timestamp': String(now),
		'revolut-signature': 't=1700000000000, v2=abc, foo',
	}, { now });

	assert.equal(result.verified, false);
	assert.equal(result.reason, 'No supported Revolut signature value found');
});

test('verifies mixed unsupported tokens and valid v1 Revolut signature', () => {
	const rawBody = JSON.stringify({ event: 'TransactionCreated' });
	const secret = 'wsk_test_secret';
	const timestamp = String(now);
	const signature = createOfficialSignature(rawBody, secret, timestamp);

	const result = verifyWebhookSignature(rawBody, secret, {
		'revolut-request-timestamp': timestamp,
		'revolut-signature': `t=${timestamp}, v2=abc, v1=${signature}`,
	}, { now });

	assert.equal(result.verified, true);
});

test('ignores invalid hex and invalid-length signature values', () => {
	const result = verifyWebhookSignature('{}', 'wsk_test_secret', {
		'revolut-request-timestamp': String(now),
		'revolut-signature': 'v1=not-hex, deadbeef, v1=abc123, abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijkl',
	}, { now });

	assert.equal(result.verified, false);
	assert.equal(result.reason, 'No supported Revolut signature value found');
});

test('accepts and normalizes uppercase raw hex signature values', () => {
	const rawBody = JSON.stringify({ event: 'TransactionCreated' });
	const secret = 'wsk_test_secret';
	const timestamp = String(now);
	const signature = createOfficialSignature(rawBody, secret, timestamp).toUpperCase();

	const result = verifyWebhookSignature(rawBody, secret, {
		'revolut-request-timestamp': timestamp,
		'revolut-signature': signature,
	}, { now });

	assert.equal(result.verified, true);
});

test('accepts and normalizes uppercase hex in v1 signature values', () => {
	const rawBody = JSON.stringify({ event: 'TransactionCreated' });
	const secret = 'wsk_test_secret';
	const timestamp = String(now);
	const signature = createOfficialSignature(rawBody, secret, timestamp).toUpperCase();

	const result = verifyWebhookSignature(rawBody, secret, {
		'revolut-request-timestamp': timestamp,
		'revolut-signature': `v1=${signature}`,
	}, { now });

	assert.equal(result.verified, true);
});

test('fails when raw-body-only signature is provided', () => {
	const rawBody = JSON.stringify({ event: 'TransactionCreated' });
	const secret = 'wsk_test_secret';
	const timestamp = String(now);
	const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

	const result = verifyWebhookSignature(rawBody, secret, {
		'revolut-request-timestamp': timestamp,
		'revolut-signature': signature,
	}, { now });

	assert.equal(result.verified, false);
	assert.equal(result.reason, 'Computed HMAC did not match any provided Revolut signature');
});

test('fails when timestamp is stale', () => {
	const rawBody = '{}';
	const secret = 'wsk_test_secret';
	const timestamp = String(now - 300_001);
	const signature = createOfficialSignature(rawBody, secret, timestamp);

	const result = verifyWebhookSignature(rawBody, secret, {
		'revolut-request-timestamp': timestamp,
		'revolut-signature': `v1=${signature}`,
	}, { now });

	assert.equal(result.verified, false);
	assert.equal(result.reason, 'Stale Revolut request timestamp');
});

test('fails when timestamp is too far in the future', () => {
	const rawBody = '{}';
	const secret = 'wsk_test_secret';
	const timestamp = String(now + 300_001);
	const signature = createOfficialSignature(rawBody, secret, timestamp);

	const result = verifyWebhookSignature(rawBody, secret, {
		'revolut-request-timestamp': timestamp,
		'revolut-signature': `v1=${signature}`,
	}, { now });

	assert.equal(result.verified, false);
	assert.equal(result.reason, 'Future Revolut request timestamp outside tolerance');
});

test('fails when timestamp is missing', () => {
	const result = verifyWebhookSignature('{}', 'wsk_test_secret', { 'revolut-signature': 'abc' }, { now });
	assert.equal(result.verified, false);
	assert.equal(result.reason, 'No Revolut request timestamp header found');
});

test('fails when timestamp is invalid', () => {
	const result = verifyWebhookSignature('{}', 'wsk_test_secret', {
		'revolut-request-timestamp': 'not-a-timestamp',
		'revolut-signature': 'abc',
	}, { now });

	assert.equal(result.verified, false);
	assert.equal(result.reason, 'Invalid Revolut request timestamp');
});

test('fails when signature header is missing', () => {
	const result = verifyWebhookSignature('{}', 'wsk_test_secret', { 'revolut-request-timestamp': String(now) }, { now });
	assert.equal(result.verified, false);
	assert.equal(result.reason, 'No Revolut signature header found');
});

test('fails safely when provided signature length differs', () => {
	const result = verifyWebhookSignature('{}', 'wsk_test_secret', {
		'revolut-request-timestamp': String(now),
		'revolut-signature': 'abc',
	}, { now });
	assert.equal(result.verified, false);
});

test('fails when signing secret is missing', () => {
	const result = verifyWebhookSignature('{}', '', { 'revolut-signature': 'abc' });
	assert.equal(result.verified, false);
	assert.equal(result.reason, 'No signing secret configured');
});
