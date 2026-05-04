import assert from 'node:assert/strict';
import { createPublicKey } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import jwt from 'jsonwebtoken';

import { RevolutBusinessOAuth2Api } from '../src/credentials/RevolutBusinessOAuth2Api.credentials';
import { buildRevolutApiErrorMessage, getCredentialEnvironment } from '../src/helpers/revolutApi';
import { buildTokenExchangeBody, createClientAssertionJwt, getRevolutAuthorizeUrl, getRevolutTokenUrl, normalisePrivateKey } from '../src/helpers/revolutAuth';

const privateKey = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC9h+H6fxyxXAyL
KQ1JSEqXb4D7fT7Yq+pzTbBv3j7CxdG/F4EjlwmS7FukjA+3ogWqn6oCWm5pLhxm
GicdXr2T0SVdQ+Jr+TnEGcI83S2X7l/1tB1XYO2oU+sx3Y9zK5epuDYpR5Mk50sl
hV3fZG0nW6j3Ad50V+y9ZjmPVwHTp/eA4wWNWqz/NA8ijMfdz2Bjz2iN06hGTiy0
Kl4I3lR0nf0JS5mfxRA0sqF0pB7wAiylDwmYyoaLk9vSMm8AUxgGn1zfpQkvjFub
JFxTR69Brxu7YLmFvWmRaN0zL3BTvkk0oVSV1svlWCEVbXK7xQ0pSxPBjm6fDk9V
d8tfk2knAgMBAAECggEAAxP2egnd+yU4aSl7dSbL1rF2ZybNR6aoFfJfL5f0U84v
7h0Z5YvRSHUeXwqwe7BddQ4wSNpsmzrNxuG+Kx8yE0Lxw2/UPYq+aiXqQ6H0i1xa
YS9hlK1YFStkzFK1Qo9HP7iHhfwXrCRoV2uI/BvmbWwH/2MdkP2BrG9vcZns4Axn
nkYwB1mc1Hq3J1tz+/+YQ+1B9m2NEh+GgJiIh69pnbYSPcRBPAubvt2WB2jnhzXW
ttB4F7/zkjU1I9Uq8B/8Xa9rKGy3G0jY7Q1/3fyq3Rukgt2nEA9Tz0CZ0aM2iIE+
MNyqE1W9qAWoP5a9vkuFo/kM4QVIaSQVKeTadA7IQQKBgQDwKEfA0fpLhQvyr8ep
J7VY7j0f0ErnD7tO7dxVbCDKmuCUzS8v9An1IdhCBgj9W9wI8wbMaB8Lwvk3jDrs
5VeVb6Z6MO5JqoWfQtx4Iqf5dO+oT68pX7LSg7+5LFXFp8Y4AXaSR+TGR8yiWX2r
cM5MvA2w04UlYIpYV91CljtkMQKBgQDHo1LfYvA3N2wMP4BTx6afroV4GZ0dyJpG
81XfRNEb3BTsSlGX1R0a2QUoP9eVyyU4L/jS4tA0ubvh+e8pH2WrXhP9llMiGvT1
Ns5H8z/rbp7c70dn8QNh14kt2CUdMn5fFo9JI+4lUq/XGQ+XFa2NbVcgJ+6JdP6r
Zw3+sKqCEQKBgB+8njWmIJI7D+Q4U+uVLSVkJvhCwS5IjYdWj4R5n6VuW7G3EGQG
B1sKqWnJQ4aKfPaM3GR2VO7GQQ3fU8j7bSEto3WvLFo2qC2cramYdxQvly6P1zAO
XMM0yU6FB7iC9BssHmZpWFzL2IZp+7I6WTb9RMwWFg3puVEdYtBz4p4hAoGAFXtc
7bY4mtWdZriNrEtxm5hyuV5X7Xv1/f+j1fxvW+wkf4wqGMNS7KOaRArKpU+s0Re2
17Qqj4ylF9sE1ZX8CVn+97nc1x0dQMM1hVcWn/V4PvpSsxlsQ+zjg5IvkV5Eo/uM
eJd6HnCbcwVbZ2/1J3X5W47rws2cSI8EQXh1U4ECgYAFqSX3qW+E9N2XzNhR8lV1
Pq0GMYWWslHLgNLl4Ppn3B8gVK0q4rkp6DqG94P6w6Wb4xhE0ny2z3Ew2s49qJuJ
28I7v3e5Z8iOorC7LiGbwGe0BsPukklqCY4Xy1Xj3rFFWYl8Mt0QGI3ShvL9dUpr
K5Hn7p5OQvqoZMpRr/ebhQ==
-----END PRIVATE KEY-----`;

test('builds sandbox token and authorize URLs', () => {
	assert.equal(getRevolutTokenUrl('sandbox'), 'https://sandbox-b2b.revolut.com/api/1.0/auth/token');
	assert.equal(getRevolutAuthorizeUrl('sandbox'), 'https://sandbox-business.revolut.com/app-confirm');
});

test('builds production token and authorize URLs', () => {
	assert.equal(getRevolutTokenUrl('production'), 'https://b2b.revolut.com/api/1.0/auth/token');
	assert.equal(getRevolutAuthorizeUrl('production'), 'https://business.revolut.com/app-confirm');
});

test('auth bootstrap script uses b2b token hosts and business authorize hosts', async () => {
	const script = await readFile(new URL('../scripts/revolut-auth.mjs', import.meta.url), 'utf8');

	assert.match(script, /https:\/\/sandbox-b2b\.revolut\.com\/api\/1\.0\/auth\/token/);
	assert.match(script, /https:\/\/b2b\.revolut\.com\/api\/1\.0\/auth\/token/);
	assert.match(script, /https:\/\/sandbox-business\.revolut\.com\/app-confirm/);
	assert.match(script, /https:\/\/business\.revolut\.com\/app-confirm/);
	assert.doesNotMatch(script, /https:\/\/sandbox-business\.revolut\.com\/api\/1\.0\/auth\/token/);
	assert.doesNotMatch(script, /https:\/\/business\.revolut\.com\/api\/1\.0\/auth\/token/);
});

test('auth bootstrap script excludes client_id and redirect_uri from token body', async () => {
	const script = await readFile(new URL('../scripts/revolut-auth.mjs', import.meta.url), 'utf8');
	const bodyBlock = script.match(/const body = new URLSearchParams\(\{(?<body>[\s\S]*?)\}\);/)?.groups?.body;

	assert.ok(bodyBlock, 'Expected token request body block in auth script');
	assert.doesNotMatch(bodyBlock, /\bclient_id\b/);
	assert.doesNotMatch(bodyBlock, /\bredirect_uri\b/);
});

test('auth bootstrap script sets comma-separated scopes as one query param', async () => {
	const script = await readFile(new URL('../scripts/revolut-auth.mjs', import.meta.url), 'utf8');

	assert.match(script, /READ,WRITE/);
	assert.match(script, /scopes\.split\(',\'\)/);
	assert.match(script, /\.map\(\(value\) => value\.trim\(\)\)/);
	assert.match(script, /\.filter\(Boolean\)/);
	assert.match(script, /\.join\(',\'\)/);
	assert.match(script, /auth\.searchParams\.set\('scope', scope\)/);
	assert.match(script, /scope=\$\{scope\.split\(',\'\)\.map\(encodeURIComponent\)\.join\(',\'\)\}/);
	assert.doesNotMatch(script, /auth\.searchParams\.append\('scope'/);
});

test('creates a signed client assertion JWT', () => {
	const token = createClientAssertionJwt({
		clientId: 'test-client-id',
		issuer: 'configured-issuer.example.com',
		privateKey,
		environment: 'sandbox',
		kid: 'kid-123',
	});

	const decoded = jwt.decode(token, { complete: true }) as { header: { alg: string; kid: string }; payload: { iss: string; sub: string; aud: string } };

	assert.equal(decoded.header.alg, 'RS256');
	assert.equal(decoded.header.kid, 'kid-123');
	assert.equal(decoded.payload.iss, 'configured-issuer.example.com');
	assert.equal(decoded.payload.sub, 'test-client-id');
	assert.equal(decoded.payload.aud, 'https://revolut.com');
});

test('creates a signed client assertion JWT from escaped-newline private key', () => {
	const token = createClientAssertionJwt({
		clientId: 'test-client-id',
		privateKey: privateKey.replace(/\n/g, '\\n'),
		kid: 'kid-123',
	});

	const decoded = jwt.decode(token, { complete: true }) as { header: { alg: string; kid: string } };

	assert.equal(decoded.header.alg, 'RS256');
	assert.equal(decoded.header.kid, 'kid-123');
});

test('creates a signed client assertion JWT from quoted pasted private key', () => {
	const token = createClientAssertionJwt({
		clientId: 'test-client-id',
		privateKey: `"${privateKey.replace(/\n/g, '\\n')}"`,
		kid: 'kid-123',
	});

	const decoded = jwt.decode(token, { complete: true }) as { header: { alg: string; kid: string } };

	assert.equal(decoded.header.alg, 'RS256');
	assert.equal(decoded.header.kid, 'kid-123');
});

test('creates a signed client assertion JWT from private key with collapsed PEM line breaks', () => {
	const token = createClientAssertionJwt({
		clientId: 'test-client-id',
		privateKey: privateKey.replace(/\n/g, ' '),
		kid: 'kid-123',
	});

	const decoded = jwt.decode(token, { complete: true }) as { header: { alg: string; kid: string } };

	assert.equal(decoded.header.alg, 'RS256');
	assert.equal(decoded.header.kid, 'kid-123');
});

test('rejects missing Revolut private key before jsonwebtoken signing', () => {
	assert.throws(
		() => createClientAssertionJwt({ clientId: 'test-client-id', privateKey: '   ' }),
		/Revolut private key is required/,
	);
	assert.throws(
		() => createClientAssertionJwt({ clientId: 'test-client-id', privateKey: undefined as never }),
		/Revolut private key is required/,
	);
});

test('rejects public key or certificate values before jsonwebtoken signing', () => {
	const publicKey = createPublicKey(privateKey).export({ format: 'pem', type: 'spki' }).toString();
	const certificate = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';

	assert.throws(
		() => createClientAssertionJwt({ clientId: 'test-client-id', privateKey: publicKey }),
		/not a certificate or public key/,
	);
	assert.throws(
		() => createClientAssertionJwt({ clientId: 'test-client-id', privateKey: certificate }),
		/not a certificate or public key/,
	);
});

test('rejects malformed Revolut private key before jsonwebtoken signing', () => {
	assert.throws(
		() => createClientAssertionJwt({ clientId: 'test-client-id', privateKey: 'not a pem private key' }),
		/not a valid PEM private key/,
	);
});

test('rejects valid non-RSA private key before jsonwebtoken signing', () => {
	const ecPrivateKey = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgOFw0D8OjYzG1tEpm
NXl7bTkf7lReCoRV5jXxVYKTnKqhRANCAARLtWGwIPLaFKpzYEHUfJCigEz/url1
CQCHYWadgybOns+DPLWqhEKffelhJsxngTNmH0FNKF9QxdHNEenCku7w
-----END PRIVATE KEY-----`;

	assert.throws(
		() => createClientAssertionJwt({ clientId: 'test-client-id', privateKey: ecPrivateKey }),
		/RSA private key suitable for RS256 client assertions/,
	);
});

test('falls back JWT issuer to client ID when no issuer is provided', () => {
	const token = createClientAssertionJwt({
		clientId: 'test-client-id',
		privateKey,
		environment: 'sandbox',
		kid: 'kid-123',
	});

	const decoded = jwt.decode(token) as { iss: string; sub: string };

	assert.equal(decoded.iss, 'test-client-id');
	assert.equal(decoded.sub, 'test-client-id');
});

test('builds refresh-token private_key_jwt token body parameters', () => {
	const payload = buildTokenExchangeBody({
		grantType: 'refresh_token',
		clientId: 'test-client-id',
		privateKey,
		environment: 'sandbox',
		kid: 'kid-123',
		issuer: 'configured-issuer.example.com',
		refreshToken: 'refresh-token-123',
	});

	assert.equal(payload.get('grant_type'), 'refresh_token');
	assert.equal(payload.get('refresh_token'), 'refresh-token-123');
	assert.equal(payload.has('client_id'), false);
	assert.equal(payload.has('redirect_uri'), false);
	assert.equal(payload.get('client_assertion_type'), 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
	assert.equal(typeof payload.get('client_assertion'), 'string');

	const decoded = jwt.decode(payload.get('client_assertion') as string, { complete: true }) as { header: { kid: string }; payload: { iss: string; sub: string; aud: string } };

	assert.equal(decoded.header.kid, 'kid-123');
	assert.equal(decoded.payload.iss, 'configured-issuer.example.com');
	assert.equal(decoded.payload.sub, 'test-client-id');
	assert.equal(decoded.payload.aud, 'https://revolut.com');
});

test('builds authorization-code private_key_jwt token body parameters', () => {
	const payload = buildTokenExchangeBody({
		grantType: 'authorization_code',
		clientId: 'test-client-id',
		privateKey,
		kid: 'kid-123',
		issuer: 'configured-issuer.example.com',
		authorizationCode: 'auth-code-123',
		redirectUri: 'https://n8n.example.com/rest/oauth2-credential/callback',
	});

	assert.equal(payload.get('grant_type'), 'authorization_code');
	assert.equal(payload.get('code'), 'auth-code-123');
	assert.equal(payload.has('redirect_uri'), false);
	assert.equal(payload.has('client_id'), false);
});

test('normalises pasted private key escaped newlines', () => {
	assert.equal(normalisePrivateKey('-----BEGIN-----\\nabc\\n-----END-----\n'), '-----BEGIN-----\nabc\n-----END-----');
});

test('normalises quoted pasted private key values', () => {
	assert.equal(normalisePrivateKey('"-----BEGIN-----\\nabc\\n-----END-----"'), '-----BEGIN-----\nabc\n-----END-----');
	assert.equal(normalisePrivateKey("'-----BEGIN-----\\nabc\\n-----END-----'"), '-----BEGIN-----\nabc\n-----END-----');
});

test('normalises PEM values when form input collapses header/footer newlines', () => {
	assert.equal(
		normalisePrivateKey('-----BEGIN PRIVATE KEY----- abc -----END PRIVATE KEY-----'),
		'-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
	);
});

test('credential does not expose misleading OAuth scope fields', () => {
	const credential = new RevolutBusinessOAuth2Api();
	const revolutScope = credential.properties.find((property) => property.name === 'revolutScope');
	const oauthScope = credential.properties.find((property) => property.name === 'scope');
	const scopesDisplay = credential.properties.find((property) => property.displayName === 'Scopes');

	assert.equal(revolutScope, undefined);
	assert.equal(oauthScope, undefined);
	assert.equal(scopesDisplay, undefined);
});

test('credential exposes required refresh token password field', () => {
	const credential = new RevolutBusinessOAuth2Api();
	const refreshToken = credential.properties.find((property) => property.name === 'refreshToken');

	assert.equal(refreshToken?.type, 'string');
	assert.equal(refreshToken?.typeOptions?.password, true);
	assert.equal(refreshToken?.required, true);
});

test('credential masks private key field while preserving rows', () => {
	const credential = new RevolutBusinessOAuth2Api();
	const privateKeyProperty = credential.properties.find((property) => property.name === 'privateKey');

	assert.equal(privateKeyProperty?.type, 'string');
	assert.equal(privateKeyProperty?.typeOptions?.rows, 6);
	assert.equal(privateKeyProperty?.typeOptions?.password, true);
	assert.equal(privateKeyProperty?.required, true);
});

test('credential environment lookup awaits asynchronous credentials', async () => {
	const environment = await getCredentialEnvironment({
		async getCredentials(credentialType: string) {
			assert.equal(credentialType, 'revolutBusinessOAuth2Api');
			return { environment: 'production' };
		},
	} as never);

	assert.equal(environment, 'production');
});

test('credential no longer extends n8n generic OAuth2 flow', () => {
	const credential = new RevolutBusinessOAuth2Api();

	assert.equal(credential.extends, undefined);
	assert.equal('preAuthentication' in credential, false);
});

test('webhook write 403 errors explain READ,WRITE re-auth requirement', () => {
	const error = Object.assign(new Error('Forbidden - perhaps check your credentials?'), { statusCode: 403 });
	const message = buildRevolutApiErrorMessage(error, 'POST', '/webhooks');

	assert.match(message, /WRITE OAuth scope/);
	assert.match(message, /npm run revolut:auth/);
	assert.match(message, /READ,WRITE/);
});

test('webhook write forbidden errors explain READ,WRITE re-auth requirement without status code', () => {
	const message = buildRevolutApiErrorMessage(new Error('Forbidden - perhaps check your credentials?'), 'POST', '/webhooks');

	assert.match(message, /READ,WRITE/);
});

test('read-only webhook errors do not suggest write scopes', () => {
	const error = Object.assign(new Error('Forbidden - perhaps check your credentials?'), { statusCode: 403 });
	const message = buildRevolutApiErrorMessage(error, 'GET', '/webhooks');

	assert.doesNotMatch(message, /WRITE OAuth scope/);
	assert.doesNotMatch(message, /READ,WRITE/);
});

test('credential exposes configured JWT issuer field', () => {
	const credential = new RevolutBusinessOAuth2Api();
	const jwtIssuer = credential.properties.find((property) => property.name === 'jwtIssuer');

	assert.equal(jwtIssuer?.displayName, 'JWT Issuer (iss)');
	assert.equal(jwtIssuer?.type, 'string');
	assert.equal(jwtIssuer?.required, true);
	assert.match(jwtIssuer?.description ?? '', /Revolut Business API configuration/);
});
