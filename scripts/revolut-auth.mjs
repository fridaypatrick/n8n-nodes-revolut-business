#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readFile } from 'node:fs/promises';
import jwt from 'jsonwebtoken';

const CLIENT_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
const AUDIENCE = 'https://revolut.com';

function parseArgs(argv) {
	const args = {};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (!arg.startsWith('--')) continue;
		const [key, inlineValue] = arg.slice(2).split('=', 2);
		args[key] = inlineValue ?? argv[index + 1];
		if (inlineValue === undefined) index += 1;
	}
	return args;
}

function tokenUrl(environment) {
	return environment === 'production'
		? 'https://b2b.revolut.com/api/1.0/auth/token'
		: 'https://sandbox-b2b.revolut.com/api/1.0/auth/token';
}

function authorizeUrl(environment) {
	return environment === 'production'
		? 'https://business.revolut.com/app-confirm'
		: 'https://sandbox-business.revolut.com/app-confirm';
}

function makeClientAssertion({ clientId, issuer, privateKey, kid }) {
	const now = Math.floor(Date.now() / 1000);
	return jwt.sign(
		{ iss: issuer || clientId, sub: clientId, aud: AUDIENCE, iat: now, exp: now + 300 },
		privateKey.replace(/\\n/g, '\n').trim(),
		{ algorithm: 'RS256', keyid: kid || undefined },
	);
}

function extractCode(inputValue) {
	const value = inputValue.trim();
	if (!value) return '';
	try {
		return new URL(value).searchParams.get('code') || value;
	} catch {
		return value;
	}
}

function expectedEnvironmentFromCode(code) {
	if (code.startsWith('oa_prod_')) return 'production';
	if (code.startsWith('oa_sandbox_') || code.startsWith('oa_sand_')) return 'sandbox';
	return undefined;
}

function assertCodeMatchesEnvironment(code, environment) {
	const expectedEnvironment = expectedEnvironmentFromCode(code);
	if (!expectedEnvironment || expectedEnvironment === environment) return;

	throw new Error(
		`Authorization code appears to be for ${expectedEnvironment}, but this helper is using ${environment}. `
		+ `Re-run with --environment ${expectedEnvironment} or generate a new ${environment} authorization code.`,
	);
}

function redactSensitiveValue(value) {
	return String(value)
		.replace(/oa_(?:prod|sandbox|sand)_[A-Za-z0-9._~+/=-]+/g, '[redacted authorization code]')
		.replace(/eyJ[A-Za-z0-9._~+/=-]+/g, '[redacted jwt/token]')
		.replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, '[redacted private key]');
}

function shouldSuggestClientAssertionSettings(responseStatus, token) {
	if (responseStatus === 401) return true;

	const values = [token?.error, token?.error_description, token?.message, token?.code, token?.type]
		.filter((value) => typeof value === 'string')
		.map((value) => value.toLowerCase());

	return values.some((value) => value.includes('invalid_client') || value.includes('unauthorized'));
}

function clientAssertionSettingsHint(issuer) {
	const configuredIssuer = issuer ? ` Configured JWT issuer: ${redactSensitiveValue(issuer).slice(0, 300)}.` : '';
	return 'Hint: check JWT issuer/client assertion settings. For Revolut, the JWT issuer (iss) should be the registered Revolut application domain only, with no https://, no path, and no trailing slash.'
		+ configuredIssuer;
}

function safeTokenErrorDetail(token, rawText, responseStatus, issuer) {
	const fields = ['error', 'error_description', 'errorMessage', 'message', 'code', 'type'];
	const details = fields
		.map((field) => [field, token?.[field]])
		.filter(([, value]) => typeof value === 'string' && value.trim())
		.map(([field, value]) => `${field}=${redactSensitiveValue(value).slice(0, 300)}`);

	const detail = details.length
		? details.join('; ')
		: (() => {
			const excerpt = redactSensitiveValue(rawText || '').replace(/\s+/g, ' ').trim().slice(0, 500);
			return excerpt ? `response body excerpt=${excerpt}` : 'Unknown error';
		})();

	return shouldSuggestClientAssertionSettings(responseStatus, token)
		? `${detail}. ${clientAssertionSettingsHint(issuer)}`
		: detail;
}

const args = parseArgs(process.argv.slice(2));
const environment = args.environment || process.env.REVOLUT_ENVIRONMENT || 'sandbox';
const clientId = args['client-id'] || process.env.REVOLUT_CLIENT_ID;
const kid = args.kid || process.env.REVOLUT_KID;
const issuer = args.issuer || args['jwt-issuer'] || process.env.REVOLUT_JWT_ISSUER;
const privateKeyPath = args['private-key-path'] || process.env.REVOLUT_PRIVATE_KEY_PATH;
const redirectUri = args['redirect-uri'] || process.env.REVOLUT_REDIRECT_URI;
const scopes = args.scopes || process.env.REVOLUT_SCOPES || 'READ,WRITE';

if (!['sandbox', 'production'].includes(environment)) {
	throw new Error('Environment must be sandbox or production.');
}

const missing = [
	['client id', clientId],
	['JWT issuer', issuer],
	['private key path', privateKeyPath],
	['redirect URI', redirectUri],
].filter(([, value]) => !value).map(([name]) => name);

if (missing.length) {
	throw new Error(`Missing required input: ${missing.join(', ')}. Provide CLI args or REVOLUT_* environment variables.`);
}

const privateKey = await readFile(privateKeyPath, 'utf8');
const auth = new URL(authorizeUrl(environment));
auth.searchParams.set('client_id', clientId);
auth.searchParams.set('redirect_uri', redirectUri);
auth.searchParams.set('response_type', 'code');
const scope = scopes.split(',').map((value) => value.trim()).filter(Boolean).join(',');
if (scope) auth.searchParams.set('scope', scope);
const authUrl = scope
	? auth.toString().replace(`scope=${encodeURIComponent(scope)}`, `scope=${scope.split(',').map(encodeURIComponent).join(',')}`)
	: auth.toString();

console.log('\nOpen this Revolut authorization URL:');
console.log(authUrl);
console.log('\nAfter approving, paste the callback URL or authorization code.');

const rl = createInterface({ input, output });
const pasted = await rl.question('Callback URL or code: ');
rl.close();

const code = extractCode(pasted);
if (!code) throw new Error('No authorization code provided.');
assertCodeMatchesEnvironment(code, environment);

const body = new URLSearchParams({
	grant_type: 'authorization_code',
	code,
	client_assertion_type: CLIENT_ASSERTION_TYPE,
	client_assertion: makeClientAssertion({ clientId, issuer, privateKey, kid }),
});

const response = await fetch(tokenUrl(environment), {
	method: 'POST',
	headers: { 'content-type': 'application/x-www-form-urlencoded' },
	body: body,
});

const rawTokenResponse = await response.text();
let token = {};
try {
	token = JSON.parse(rawTokenResponse || '{}');
} catch {
	// Non-JSON error bodies are handled by safeTokenErrorDetail below.
}
if (!response.ok) {
	throw new Error(`Token exchange failed (${response.status}): ${safeTokenErrorDetail(token, rawTokenResponse, response.status, issuer)}`);
}

console.log('\nToken exchange succeeded. Store this refresh token in the n8n credential:');
console.log(token.refresh_token || '(No refresh_token returned)');
console.log('\nToken metadata:');
console.log(JSON.stringify({ token_type: token.token_type, expires_in: token.expires_in, scope: token.scope }, null, 2));
