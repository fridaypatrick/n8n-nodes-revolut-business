import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';

import { verifyWebhookSignature } from '../src/helpers/webhookSignature';

test('verifies matching HMAC signature', () => {
	const rawBody = JSON.stringify({ event: 'TransactionCreated' });
	const secret = 'wsk_test_secret';
	const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

	const result = verifyWebhookSignature(rawBody, secret, { 'revolut-signature': signature });

	assert.equal(result.verified, true);
});

test('fails when signature header is missing', () => {
	const result = verifyWebhookSignature('{}', 'wsk_test_secret', {});
	assert.equal(result.verified, false);
	assert.equal(result.reason, 'No Revolut signature header found');
});

test('fails safely when provided signature length differs', () => {
	const result = verifyWebhookSignature('{}', 'wsk_test_secret', { 'revolut-signature': 'abc' });
	assert.equal(result.verified, false);
});

test('fails when signing secret is missing', () => {
	const result = verifyWebhookSignature('{}', '', { 'revolut-signature': 'abc' });
	assert.equal(result.verified, false);
	assert.equal(result.reason, 'No signing secret configured');
});
