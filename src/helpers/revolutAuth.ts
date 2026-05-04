import { createPrivateKey } from 'node:crypto';

import jwt from 'jsonwebtoken';

import type { RevolutEnvironment } from '../types/revolut';

const REVOLUT_CLIENT_ASSERTION_AUDIENCE = 'https://revolut.com';

export interface JwtAssertionOptions {
	clientId: string;
	issuer?: string;
	privateKey: string;
	kid?: string;
	environment?: RevolutEnvironment;
}

export interface RevolutTokenExchangeOptions extends JwtAssertionOptions {
	refreshToken?: string;
	authorizationCode?: string;
	redirectUri?: string;
	grantType: 'refresh_token' | 'authorization_code';
}

export function getRevolutTokenUrl(environment: RevolutEnvironment): string {
	return environment === 'production'
		? 'https://b2b.revolut.com/api/1.0/auth/token'
		: 'https://sandbox-b2b.revolut.com/api/1.0/auth/token';
}

export function getRevolutAuthorizeUrl(environment: RevolutEnvironment): string {
	return environment === 'production'
		? 'https://business.revolut.com/app-confirm'
		: 'https://sandbox-business.revolut.com/app-confirm';
}

export function createClientAssertionJwt(options: JwtAssertionOptions): string {
	const now = Math.floor(Date.now() / 1000);
	const issuer = options.issuer || options.clientId;
	const privateKey = validatePrivateKeyForRs256(normalisePrivateKey(options.privateKey));

	return jwt.sign(
		{
			iss: issuer,
			sub: options.clientId,
			aud: REVOLUT_CLIENT_ASSERTION_AUDIENCE,
			iat: now,
			exp: now + 300,
		},
		privateKey,
		{
			algorithm: 'RS256',
			keyid: options.kid,
		},
	);
}

export function normalisePrivateKey(privateKey?: string): string {
	let normalized = (privateKey ?? '').trim();

	if (hasMatchingSurroundingQuotes(normalized)) {
		normalized = normalized.slice(1, -1).trim();
	}

	normalized = normalized.replace(/\\n/g, '\n').trim();
	normalized = restorePemLineBreaks(normalized);

	if (hasMatchingSurroundingQuotes(normalized)) {
		normalized = normalized.slice(1, -1).trim();
		normalized = restorePemLineBreaks(normalized);
	}

	return normalized;
}

function restorePemLineBreaks(value: string): string {
	return value
		.replace(/-----BEGIN ([A-Z ]+)-----\s+/g, '-----BEGIN $1-----\n')
		.replace(/\s+-----END ([A-Z ]+)-----/g, '\n-----END $1-----');
}

function hasMatchingSurroundingQuotes(value: string): boolean {
	if (value.length < 2) {
		return false;
	}

	const first = value[0];
	const last = value[value.length - 1];

	return (first === '"' || first === "'") && first === last;
}

function validatePrivateKeyForRs256(privateKey: string): string {
	if (!privateKey) {
		throw new Error('Revolut private key is required. Paste the full PEM private key, including BEGIN PRIVATE KEY and END PRIVATE KEY lines.');
	}

	if (/-----BEGIN (?:CERTIFICATE|PUBLIC KEY|RSA PUBLIC KEY)-----/.test(privateKey)) {
		throw new Error('Revolut private key must be a PEM private key, not a certificate or public key. Paste the private key generated for the Revolut Business API application.');
	}

	let keyObject;
	try {
		keyObject = createPrivateKey(privateKey);
	} catch {
		throw new Error('Revolut private key is not a valid PEM private key. Paste the full unencrypted private key, including BEGIN PRIVATE KEY and END PRIVATE KEY lines.');
	}

	if (keyObject.asymmetricKeyType !== 'rsa') {
		throw new Error('Revolut private key must be an RSA private key suitable for RS256 client assertions. Generate or paste an RSA PEM private key.');
	}

	return privateKey;
}

export function buildTokenExchangeBody(options: RevolutTokenExchangeOptions): URLSearchParams {
	const body = new URLSearchParams({
		grant_type: options.grantType,
		client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
		client_assertion: createClientAssertionJwt({
			clientId: options.clientId,
			issuer: options.issuer,
			privateKey: normalisePrivateKey(options.privateKey),
			kid: options.kid,
			environment: options.environment,
		}),
	});

	if (options.grantType === 'refresh_token') {
		if (!options.refreshToken) {
			throw new Error('Refresh token is required for Revolut token refresh.');
		}
		body.set('refresh_token', options.refreshToken);
	} else {
		if (!options.authorizationCode || !options.redirectUri) {
			throw new Error('Authorization code and redirect URI are required for Revolut authorization-code exchange.');
		}
		body.set('code', options.authorizationCode);
	}

	return body;
}
