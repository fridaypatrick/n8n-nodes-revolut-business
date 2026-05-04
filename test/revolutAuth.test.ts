import assert from 'node:assert/strict';
import { test } from 'node:test';

import jwt from 'jsonwebtoken';

import { RevolutBusinessOAuth2Api } from '../src/credentials/RevolutBusinessOAuth2Api.credentials';
import { createClientAssertionJwt, getRevolutAuthorizeUrl, getRevolutTokenUrl } from '../src/helpers/revolutAuth';

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
	assert.equal(getRevolutTokenUrl('sandbox'), 'https://sandbox-business.revolut.com/api/1.0/auth/token');
	assert.equal(getRevolutAuthorizeUrl('sandbox'), 'https://sandbox-business.revolut.com/app-confirm');
});

test('builds production token and authorize URLs', () => {
	assert.equal(getRevolutTokenUrl('production'), 'https://business.revolut.com/api/1.0/auth/token');
	assert.equal(getRevolutAuthorizeUrl('production'), 'https://business.revolut.com/app-confirm');
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

test('preAuthentication returns Revolut private_key_jwt token body parameters', async () => {
	const credential = new RevolutBusinessOAuth2Api();
	const payload = await credential.preAuthentication.call({} as never, {
		clientId: 'test-client-id',
		privateKey,
		environment: 'sandbox',
		kid: 'kid-123',
		jwtIssuer: 'configured-issuer.example.com',
	});

	assert.equal(payload.client_id, 'test-client-id');
	assert.equal(payload.client_assertion_type, 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
	assert.equal(typeof payload.client_assertion, 'string');

	const decoded = jwt.decode(payload.client_assertion as string, { complete: true }) as { header: { kid: string }; payload: { iss: string; sub: string; aud: string } };

	assert.equal(decoded.header.kid, 'kid-123');
	assert.equal(decoded.payload.iss, 'configured-issuer.example.com');
	assert.equal(decoded.payload.sub, 'test-client-id');
	assert.equal(decoded.payload.aud, 'https://revolut.com');
});

test('credential maps visible Revolut scope into n8n OAuth2 scope field', () => {
	const credential = new RevolutBusinessOAuth2Api();
	const revolutScope = credential.properties.find((property) => property.name === 'revolutScope');
	const oauthScope = credential.properties.find((property) => property.name === 'scope');

	assert.equal(revolutScope?.type, 'string');
	assert.equal(revolutScope?.default, 'READ,EDIT');
	assert.equal(oauthScope?.type, 'hidden');
	assert.equal(oauthScope?.default, '={{$self["revolutScope"]}}');
});

test('credential exposes configured JWT issuer field', () => {
	const credential = new RevolutBusinessOAuth2Api();
	const jwtIssuer = credential.properties.find((property) => property.name === 'jwtIssuer');

	assert.equal(jwtIssuer?.displayName, 'JWT Issuer (iss)');
	assert.equal(jwtIssuer?.type, 'string');
	assert.equal(jwtIssuer?.required, true);
	assert.match(jwtIssuer?.description ?? '', /Revolut Business API configuration/);
});
