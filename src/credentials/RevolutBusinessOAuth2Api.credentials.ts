import type {
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IDataObject,
	IHttpRequestHelper,
	INodeProperties,
} from 'n8n-workflow';

import { createClientAssertionJwt } from '../helpers/revolutAuth';

export class RevolutBusinessOAuth2Api implements ICredentialType {
	name = 'revolutBusinessOAuth2Api';
	displayName = 'Revolut Business OAuth2 API';
	icon = 'file:bank-icon.svg' as const;
	documentationUrl = 'https://developer.revolut.com/docs/business/business-api';
	extends = ['oAuth2Api'];
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
			displayName: 'Client Secret',
			name: 'clientSecret',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'Private Key (PEM)',
			name: 'privateKey',
			type: 'string',
			typeOptions: {
				rows: 6,
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
			displayName: 'Scopes',
			name: 'revolutScope',
			type: 'string',
			default: 'READ,EDIT',
			description: 'Valid Revolut scopes are case-sensitive and comma-separated. READ,EDIT is required for webhook management.',
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'hidden',
			default: '={{$self["revolutScope"]}}',
		},
		{
			displayName: 'Auth URI',
			name: 'authUrl',
			type: 'hidden',
			default: '={{$self["environment"] === "production" ? "https://business.revolut.com/app-confirm" : "https://sandbox-business.revolut.com/app-confirm"}}',
		},
		{
			displayName: 'Access Token URI',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: '={{$self["environment"] === "production" ? "https://business.revolut.com/api/1.0/auth/token" : "https://sandbox-business.revolut.com/api/1.0/auth/token"}}',
		},
		{
			displayName: 'Redirect URI Notes',
			name: 'redirectUriNotes',
			type: 'notice',
			default: '',
			description: 'n8n derives the OAuth callback URL from its hosting configuration. Revolut requires that exact redirect URI to be registered for the selected environment.',
		},
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'authorizationCode',
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'body',
		},
	];

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.environment === "production" ? "https://b2b.revolut.com/api/2.0" : "https://sandbox-b2b.revolut.com/api/2.0"}}',
			url: '/webhooks',
			method: 'GET',
			json: true,
		},
	};

	// Limitation: this credential relies on n8n's generic OAuth2 flow calling preAuthentication for both
	// the initial authorization-code exchange and refresh-token requests so we can inject a fresh
	// private_key_jwt assertion each time. The hidden clientSecret field remains only because the shared
	// oAuth2Api credential shape expects it, not because Revolut needs a static client secret here.
	async preAuthentication(
		this: IHttpRequestHelper,
		credentials: ICredentialDataDecryptedObject,
	): Promise<IDataObject> {
		const environment = (credentials.environment as 'sandbox' | 'production' | undefined) ?? 'sandbox';
		const clientAssertion = createClientAssertionJwt({
			clientId: credentials.clientId as string,
			issuer: (credentials.jwtIssuer as string) || undefined,
			privateKey: credentials.privateKey as string,
			kid: (credentials.kid as string) || undefined,
			environment,
		});

		return {
			client_id: credentials.clientId as string,
			client_assertion: clientAssertion,
			client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
		};
	}
}
