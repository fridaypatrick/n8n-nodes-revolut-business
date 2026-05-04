import jwt from 'jsonwebtoken';

import type { RevolutEnvironment } from '../types/revolut';

const REVOLUT_CLIENT_ASSERTION_AUDIENCE = 'https://revolut.com';

export interface JwtAssertionOptions {
	clientId: string;
	issuer?: string;
	privateKey: string;
	kid?: string;
	environment: RevolutEnvironment;
}

export function getRevolutTokenUrl(environment: RevolutEnvironment): string {
	return environment === 'production'
		? 'https://business.revolut.com/api/1.0/auth/token'
		: 'https://sandbox-business.revolut.com/api/1.0/auth/token';
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
