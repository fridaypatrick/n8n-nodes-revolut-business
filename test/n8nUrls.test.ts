import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deriveBaseUrl, deriveOauthCallbackUrl } from '../src/helpers/n8nUrls';

test('prefers webhook url when deriving base url', () => {
	assert.equal(deriveBaseUrl({ webhookUrl: 'http://localhost:5678' }), 'http://localhost:5678/');
});

test('derives oauth callback from host context', () => {
	assert.equal(
		deriveOauthCallbackUrl({ protocol: 'http', host: 'localhost', port: 5678 }),
		'http://localhost:5678/rest/oauth2-credential/callback?cid=revolutBusinessOAuth2Api',
	);
});
