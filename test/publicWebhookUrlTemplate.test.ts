import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	assertAutoRegisteredSigningSecret,
	extractWebhookIdFromUrl,
	getSigningSecretForWebhookVerification,
	getStoredSigningSecret,
	hasWebhookUrlDrift,
	hasPersistableSigningSecret,
	isN8nTestWebhookUrl,
	RevolutBusinessWebhookTrigger,
	resolvePublicWebhookUrl,
	shouldVerifyWebhookSignature,
} from '../src/nodes/RevolutBusinessWebhookTrigger/RevolutBusinessWebhookTrigger.node';

test('extracts webhook id from production webhook url', () => {
	assert.equal(
		extractWebhookIdFromUrl('https://n8n.example.com/webhook/abc123/revolut-business'),
		'abc123',
	);
});

test('extracts webhook id from test webhook url', () => {
	assert.equal(
		extractWebhookIdFromUrl('https://n8n.example.com/webhook-test/test-id/revolut-business'),
		'test-id',
	);
});

test('resolves production public webhook url template using node webhook id', () => {
	assert.equal(
		resolvePublicWebhookUrl(
			'https://n8n.example.com/webhook/native-id/revolut-business',
			'https://n8n-hooks.example.com/hooks/revolut-business/{webhookId}',
			'node-id',
		),
		'https://n8n-hooks.example.com/hooks/revolut-business/node-id',
	);
});

test('resolves production public webhook url template using parsed webhook id fallback', () => {
	assert.equal(
		resolvePublicWebhookUrl(
			'https://n8n.example.com/webhook/fallback-id/revolut-business',
			'https://n8n-hooks.example.com/hooks/revolut-business/{webhookId}',
		),
		'https://n8n-hooks.example.com/hooks/revolut-business/fallback-id',
	);
});

test('ignores public webhook url template for test webhook url', () => {
	assert.equal(isN8nTestWebhookUrl('https://n8n.example.com/webhook-test/test-id/revolut-business'), true);

	assert.equal(
		resolvePublicWebhookUrl(
			'https://n8n.example.com/webhook-test/test-id/revolut-business',
			'http://bad.example.com/hooks/{wrong}',
		),
		'https://n8n.example.com/webhook-test/test-id/revolut-business',
	);
});

test('detects lifecycle drift when stored url differs from current desired url', () => {
	const storedUrl = 'https://n8n.example.com/webhook/native-id/revolut-business';
	const desiredUrl = resolvePublicWebhookUrl(
		'https://n8n.example.com/webhook/native-id/revolut-business',
		'https://n8n-hooks.example.com/hooks/revolut-business/{webhookId}',
	);

	assert.equal(desiredUrl, 'https://n8n-hooks.example.com/hooks/revolut-business/native-id');
	assert.equal(hasWebhookUrlDrift(storedUrl, desiredUrl), true);
});

test('does not report lifecycle drift when stored url matches current desired url', () => {
	const desiredUrl = resolvePublicWebhookUrl(
		'https://n8n.example.com/webhook/native-id/revolut-business',
		'https://n8n-hooks.example.com/hooks/revolut-business/{webhookId}',
	);

	assert.equal(hasWebhookUrlDrift(desiredUrl, desiredUrl), false);
});

test('requires exactly one webhook id placeholder', () => {
	assert.throws(
		() => resolvePublicWebhookUrl(
			'https://n8n.example.com/webhook/native-id/revolut-business',
			'https://n8n-hooks.example.com/hooks/revolut-business/static',
		),
		/exactly one \{webhookId\}/,
	);

	assert.throws(
		() => resolvePublicWebhookUrl(
			'https://n8n.example.com/webhook/native-id/revolut-business',
			'https://n8n-hooks.example.com/hooks/{webhookId}/{webhookId}',
		),
		/exactly one \{webhookId\}/,
	);
});

test('rejects unsupported placeholder-looking tokens', () => {
	assert.throws(
		() => resolvePublicWebhookUrl(
			'https://n8n.example.com/webhook/native-id/revolut-business',
			'https://n8n-hooks.example.com/hooks/{id}',
		),
		/only supports the \{webhookId\} placeholder/,
	);
});

test('requires resolved public webhook url to use https', () => {
	assert.throws(
		() => resolvePublicWebhookUrl(
			'https://n8n.example.com/webhook/native-id/revolut-business',
			'http://n8n-hooks.example.com/hooks/{webhookId}',
		),
		/must use HTTPS/,
	);
});

test('automatic registration always requires signature verification', () => {
	assert.equal(shouldVerifyWebhookSignature(true, false), true);
	assert.equal(shouldVerifyWebhookSignature(true, true), true);
	assert.equal(shouldVerifyWebhookSignature(false, true), true);
	assert.equal(shouldVerifyWebhookSignature(false, false), false);
});

test('reads stored automatic signing secret from lifecycle state', () => {
	assert.equal(getStoredSigningSecret({}), undefined);
	assert.equal(getStoredSigningSecret({ revolutWebhook: { id: 'hook-id', url: 'https://example.com', events: [], signingSecret: 'secret' } }), 'secret');
});

test('fails closed when automatic registration has no stored signing secret', () => {
	assert.throws(
		() => getSigningSecretForWebhookVerification(true, { revolutWebhook: { id: 'hook-id', url: 'https://example.com', events: [] } }, ''),
		/no signing secret is stored/,
	);
});

test('uses stored signing secret for automatic registration and manual secret otherwise', () => {
	assert.equal(
		getSigningSecretForWebhookVerification(true, { revolutWebhook: { id: 'hook-id', url: 'https://example.com', events: [], signingSecret: 'stored-secret' } }, 'manual-secret'),
		'stored-secret',
	);
	assert.equal(getSigningSecretForWebhookVerification(false, {}, 'manual-secret'), 'manual-secret');
});

test('activation fails when automatic registration cannot persist a signing secret', () => {
	assert.throws(
		() => assertAutoRegisteredSigningSecret({ id: 'hook-id', url: 'https://example.com', events: [] }),
		/Automatic signature verification requires Revolut to return a webhook signing secret/,
	);
});

test('activation accepts automatic registration state with persisted signing secret', () => {
	const state = { id: 'hook-id', url: 'https://example.com', events: [], signingSecret: 'stored-secret' };
	assert.equal(assertAutoRegisteredSigningSecret(state), state);
});

test('created webhook state without signing secret is not persistable', () => {
	assert.equal(hasPersistableSigningSecret({ signingSecret: undefined }), false);
	assert.equal(hasPersistableSigningSecret({ signingSecret: '' }), false);
	assert.equal(hasPersistableSigningSecret({ signingSecret: 'stored-secret' }), true);
});

test('trigger hides manual signature fields while automatic registration is enabled', () => {
	const properties = new RevolutBusinessWebhookTrigger().description.properties;
	const verifySignature = properties.find((property) => property.name === 'verifySignature');
	const signingSecret = properties.find((property) => property.name === 'signingSecret');
	const autoNotice = properties.find((property) => property.name === 'automaticSignatureVerificationNotice');

	assert.deepEqual(verifySignature?.displayOptions, { show: { registerWebhook: [false] } });
	assert.deepEqual(signingSecret?.displayOptions, { show: { registerWebhook: [false], verifySignature: [true] } });
	assert.deepEqual(autoNotice?.displayOptions, { show: { registerWebhook: [true] } });
});
