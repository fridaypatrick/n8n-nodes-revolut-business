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

	return jwt.sign(
		{
			iss: issuer,
			sub: options.clientId,
			aud: REVOLUT_CLIENT_ASSERTION_AUDIENCE,
			iat: now,
			exp: now + 300,
		},
		options.privateKey,
		{
			algorithm: 'RS256',
			keyid: options.kid,
		},
	);
}

export function normalisePrivateKey(privateKey: string): string {
	return privateKey.replace(/\\n/g, '\n').trim();
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
