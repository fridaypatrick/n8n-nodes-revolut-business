import type {
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';
import { ApplicationError } from 'n8n-workflow';

import { buildTokenExchangeBody, getRevolutTokenUrl } from '../helpers/revolutAuth';

export class RevolutBusinessOAuth2Api implements ICredentialType {
	name = 'revolutBusinessOAuth2Api';
	displayName = 'Revolut Business API (Manual Refresh Token)';
	icon = 'file:bank-icon.svg' as const;
	documentationUrl = 'https://developer.revolut.com/docs/business/business-api';
	properties: INodeProperties[] = [
		{
			displayName: 'Environment',
			name: 'environment',
			type: 'options',
			default: 'sandbox',
			options: [
				{ name: 'Sandbox', value: 'sandbox' },
				{ name: 'Production', value: 'production' },
			],
			description: 'Sandbox-first default. Switch to production only after registering the production redirect URI in Revolut.',
		},
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'Private Key (PEM)',
			name: 'privateKey',
			type: 'string',
			typeOptions: {
				rows: 6,
				password: true,
			},
			default: '',
			required: true,
			description: 'Private key used to sign the client assertion JWT.',
		},
		{
			displayName: 'Key ID (kid)',
			name: 'kid',
			type: 'string',
			default: '',
			description: 'Optional API Certificate ID to send as the JWT header kid. Revolut may require this to match the certificate ID shown for your Business API app.',
		},
		{
			displayName: 'JWT Issuer (iss)',
			name: 'jwtIssuer',
			type: 'string',
			default: '',
			required: true,
			description: 'Issuer to send in the client assertion JWT iss claim. This must exactly match the issuer shown in your Revolut Business API configuration.',
		},
		{
			displayName: 'Refresh Token',
			name: 'refreshToken',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'Refresh token obtained with scripts/revolut-auth.mjs. Revolut may rotate this token; update it here if API calls start failing after a refresh.',
		},
	];

	async authenticate(
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const environment = credentials.environment === 'production' ? 'production' : 'sandbox';
		const tokenUrl = getRevolutTokenUrl(environment);

		let response: Response;
		try {
			response = await fetch(tokenUrl, {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: buildTokenExchangeBody({
					grantType: 'refresh_token',
					clientId: credentials.clientId as string,
					issuer: (credentials.jwtIssuer as string) || undefined,
					privateKey: credentials.privateKey as string,
					kid: (credentials.kid as string) || undefined,
					refreshToken: credentials.refreshToken as string,
					environment,
				}),
			});
		} catch (error) {
			throw new ApplicationError(`Could not refresh Revolut Business access token: ${(error as Error).message}`, {
				level: 'warning',
			});
		}

		const tokenResponse = await response.json().catch(() => ({})) as { access_token?: string; error?: string; error_description?: string };
		if (!response.ok || !tokenResponse.access_token) {
			const detail = tokenResponse.error_description || tokenResponse.error || `HTTP ${response.status}`;
			throw new ApplicationError(`Could not refresh Revolut Business access token (${detail}). Check that the refresh token is still valid and belongs to this client, and verify client ID, private key, issuer, and kid.`, {
				level: 'warning',
			});
		}

		requestOptions.headers = {
			...(requestOptions.headers ?? {}),
			Authorization: `Bearer ${tokenResponse.access_token}`,
		};

		return requestOptions;
	}

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.environment === "production" ? "https://b2b.revolut.com/api/2.0" : "https://sandbox-b2b.revolut.com/api/2.0"}}',
			url: '/webhooks',
			method: 'GET',
			json: true,
		},
	};

}
