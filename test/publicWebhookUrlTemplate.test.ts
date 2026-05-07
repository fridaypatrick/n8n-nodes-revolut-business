import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	extractWebhookIdFromUrl,
	hasWebhookUrlDrift,
	isN8nTestWebhookUrl,
	resolvePublicWebhookUrl,
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
