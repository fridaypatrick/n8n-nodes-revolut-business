import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	JsonObject,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { REVOLUT_WEBHOOK_DEFAULT_EVENTS, REVOLUT_WEBHOOK_HTTP_PATH, revolutWebhookEventOptions } from '../../helpers/constants';
import { isNotFoundResponse, normaliseWebhookHeaders, revolutApiRequest, revolutApiRequestWithFullResponse } from '../../helpers/revolutApi';
import type { RevolutWebhook, StoredRevolutWebhookLifecycle } from '../../types/revolut';
import { verifyWebhookSignature } from '../../helpers/webhookSignature';

function readStoredWebhookState(nodeData: IDataObject): StoredRevolutWebhookLifecycle | undefined {
	const state = nodeData.revolutWebhook;
	if (!state || typeof state !== 'object') {
		return undefined;
	}

	const candidate = state as Partial<StoredRevolutWebhookLifecycle>;
	if (typeof candidate.id !== 'string' || typeof candidate.url !== 'string' || !Array.isArray(candidate.events)) {
		return undefined;
	}

	return {
		id: candidate.id,
		url: candidate.url,
		events: candidate.events.filter((event): event is string => typeof event === 'string'),
		signingSecret: typeof candidate.signingSecret === 'string' ? candidate.signingSecret : undefined,
	};
}

function getWebhookSigningSecret(webhook: Pick<RevolutWebhook, 'signing_secret'>): string | undefined {
	return typeof webhook.signing_secret === 'string' && webhook.signing_secret ? webhook.signing_secret : undefined;
}

export function getStoredSigningSecret(nodeData: IDataObject): string | undefined {
	return readStoredWebhookState(nodeData)?.signingSecret;
}

export function shouldVerifyWebhookSignature(registerWebhook: boolean, manualVerifySignature: boolean): boolean {
	return registerWebhook || manualVerifySignature;
}

export function getManualSigningSecretForWebhookVerification(
	registerWebhook: boolean,
	getNodeParameter: (parameterName: string) => unknown,
): string {
	return registerWebhook ? '' : getNodeParameter('signingSecret') as string;
}

export function getSigningSecretForWebhookVerification(
	registerWebhook: boolean,
	nodeData: IDataObject,
	manualSigningSecret: string,
	node?: ReturnType<IHookFunctions['getNode']>,
): string | undefined {
	if (!registerWebhook) {
		return manualSigningSecret;
	}

	const signingSecret = getStoredSigningSecret(nodeData);
	if (!signingSecret) {
		const message = 'Automatically registered Revolut webhook signatures must be verified, but no signing secret is stored. Deactivate and reactivate this workflow, or retrieve/rotate the webhook signing secret in Revolut and recreate the registration.';
		throw node ? new NodeOperationError(node, message) : new Error(message);
	}

	return signingSecret;
}

export function assertAutoRegisteredSigningSecret(
	state: StoredRevolutWebhookLifecycle,
	node?: ReturnType<IHookFunctions['getNode']>,
): StoredRevolutWebhookLifecycle {
	if (hasPersistableSigningSecret(state)) {
		return state;
	}

	const message = 'Automatic signature verification requires Revolut to return a webhook signing secret during activation. Delete and recreate the Revolut webhook, or disable automatic registration and configure manual signature verification with the signing secret.';
	throw node ? new NodeOperationError(node, message) : new Error(message);
}

export function hasPersistableSigningSecret(state: Pick<StoredRevolutWebhookLifecycle, 'signingSecret'>): boolean {
	return typeof state.signingSecret === 'string' && state.signingSecret.length > 0;
}

async function findWebhookByUrl(this: IHookFunctions, webhookUrl: string): Promise<RevolutWebhook | undefined> {
	const webhooks = await revolutApiRequest<RevolutWebhook[]>(this, 'GET', '/webhooks');
	return webhooks.find((webhook) => webhook.url === webhookUrl);
}

function storeWebhookState(this: IHookFunctions, state: StoredRevolutWebhookLifecycle): void {
	this.getWorkflowStaticData('node').revolutWebhook = state;
}

function clearWebhookState(this: IHookFunctions): void {
	delete this.getWorkflowStaticData('node').revolutWebhook;
}

function createTemplateError(node: ReturnType<IHookFunctions['getNode']> | undefined, message: string): Error {
	return node ? new NodeOperationError(node, message) : new Error(message);
}

export function extractWebhookIdFromUrl(webhookUrl: string): string | undefined {
	try {
		const pathname = new URL(webhookUrl).pathname;
		return pathname.match(/\/webhook(?:-test)?\/([^/]+)/)?.[1];
	} catch {
		return undefined;
	}
}

export function isN8nTestWebhookUrl(webhookUrl: string): boolean {
	// n8n does not expose a separate hook lifecycle flag here, so keep test-mode detection centralized.
	return webhookUrl.includes('/webhook-test/');
}

export function hasWebhookUrlDrift(storedUrl: string, desiredUrl: string): boolean {
	return storedUrl !== desiredUrl;
}

export function resolvePublicWebhookUrl(
	nativeWebhookUrl: string,
	publicWebhookUrlTemplate: string | undefined,
	nodeWebhookId?: string,
	node?: ReturnType<IHookFunctions['getNode']>,
): string {
	const template = publicWebhookUrlTemplate?.trim();
	if (!template || isN8nTestWebhookUrl(nativeWebhookUrl)) {
		return nativeWebhookUrl;
	}

	const braceTokens = template.match(/\{[^}]*\}/g) ?? [];
	const webhookIdTokens = braceTokens.filter((token) => token === '{webhookId}');
	if (braceTokens.some((token) => token !== '{webhookId}')) {
		throw createTemplateError(node, 'Public Webhook URL Template only supports the {webhookId} placeholder');
	}
	if (webhookIdTokens.length !== 1) {
		throw createTemplateError(node, 'Public Webhook URL Template must contain exactly one {webhookId} placeholder');
	}

	const webhookId = nodeWebhookId || extractWebhookIdFromUrl(nativeWebhookUrl);
	if (!webhookId) {
		throw createTemplateError(node, 'Could not determine the n8n webhook ID for the Public Webhook URL Template');
	}

	const resolvedUrl = template.replace('{webhookId}', webhookId);
	let parsed: URL;
	try {
		parsed = new URL(resolvedUrl);
	} catch {
		throw createTemplateError(node, 'Resolved Public Webhook URL Template must be a valid HTTPS URL');
	}
	if (parsed.protocol !== 'https:') {
		throw createTemplateError(node, 'Resolved Public Webhook URL Template must use HTTPS');
	}

	return resolvedUrl;
}

function getEffectiveWebhookUrl(this: IHookFunctions): string {
	const nativeWebhookUrl = this.getNodeWebhookUrl('default');
	if (!nativeWebhookUrl) {
		throw new NodeOperationError(this.getNode(), 'Could not determine the n8n webhook URL for this trigger');
	}

	return resolvePublicWebhookUrl(
		nativeWebhookUrl,
		this.getNodeParameter('publicWebhookUrlTemplate', '') as string,
		this.getNode().webhookId,
		this.getNode(),
	);
}

export class RevolutBusinessWebhookTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Revolut Business Trigger',
		name: 'revolutBusinessWebhookTrigger',
		icon: 'file:bank-icon.svg',
		group: ['trigger'],
		version: 1,
		description: 'Handle incoming Revolut Business webhook events',
		defaults: {
			name: 'Revolut Business Trigger',
		},
		inputs: [],
		outputs: ['main'],
		credentials: [
			{
				name: 'revolutBusinessOAuth2Api',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: REVOLUT_WEBHOOK_HTTP_PATH,
			},
		],
		properties: [
			{
				displayName:
					'n8n shows the actual test and production webhook URLs in the native Webhook URLs section. For manual Revolut webhook creation, use the production URL for active workflows.',
				name: 'webhookUrlNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				options: revolutWebhookEventOptions ?? [],
				default: REVOLUT_WEBHOOK_DEFAULT_EVENTS,
				description: 'Used when this node auto-registers a webhook during activation',
			},
			{
				displayName: 'Register Webhook Automatically',
				name: 'registerWebhook',
				type: 'boolean',
				default: true,
				description: 'When enabled, activation creates a Revolut webhook pointing to this n8n URL',
			},
			{
				displayName: 'Public Webhook URL Template',
				name: 'publicWebhookUrlTemplate',
				type: 'string',
				default: '',
				placeholder: 'https://example.com/hooks/revolut-business/{webhookId}',
				description: 'Optional production-only public URL template registered with Revolut. Must contain exactly one {webhookId} placeholder and resolve to HTTPS. Test webhooks keep using n8n\'s native test URL.',
				displayOptions: {
					show: {
						registerWebhook: [true],
					},
				},
			},
			{
				displayName: 'Automatically registered Revolut webhooks always verify signatures using the signing secret returned by Revolut.',
				name: 'automaticSignatureVerificationNotice',
				type: 'notice',
				default: '',
				displayOptions: {
					show: {
						registerWebhook: [true],
					},
				},
			},
			{
				displayName: 'Verify Signature',
				name: 'verifySignature',
				type: 'boolean',
				default: false,
				description: 'Best-effort HMAC verification. Exact Revolut signature header format is assumed and documented in README.',
				displayOptions: {
					show: {
						registerWebhook: [false],
					},
				},
			},
			{
				displayName: 'Signing Secret',
				name: 'signingSecret',
				type: 'string',
				default: '',
				typeOptions: {
					password: true,
				},
				displayOptions: {
					show: {
						registerWebhook: [false],
						verifySignature: [true],
					},
				},
			},
		],
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const body = (this.getBodyData() ?? {}) as IDataObject;
		const headers = normaliseWebhookHeaders(this.getHeaderData() as JsonObject);
		const rawBody = this.getRequestObject().rawBody?.toString();
		const registerWebhook = this.getNodeParameter('registerWebhook') as boolean;
		const manualVerifySignature = registerWebhook ? false : this.getNodeParameter('verifySignature') as boolean;
		const verifySignature = shouldVerifyWebhookSignature(registerWebhook, manualVerifySignature);

		let signature: IDataObject = { verified: false, skipped: true };
		if (verifySignature) {
			if (!rawBody) {
				throw new NodeOperationError(this.getNode(), 'Webhook signature verification requires the raw request body, but it was not available from n8n for this request');
			}
			const manualSigningSecret = getManualSigningSecretForWebhookVerification(registerWebhook, this.getNodeParameter.bind(this));
			const signingSecret = getSigningSecretForWebhookVerification(registerWebhook, this.getWorkflowStaticData('node'), manualSigningSecret, this.getNode());
			signature = verifyWebhookSignature(rawBody, signingSecret, headers) as unknown as IDataObject;
			if (!signature.verified) {
				throw new NodeOperationError(this.getNode(), `Webhook signature verification failed: ${String(signature.reason ?? 'unknown reason')}`);
			}
		}

		return {
			workflowData: [
				[
					{
						json: {
							...body,
							revolutWebhookMeta: {
								headers,
								signature,
								receivedAt: new Date().toISOString(),
							},
						},
					},
				],
			],
		};
	}

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions) {
				const registerWebhook = this.getNodeParameter('registerWebhook') as boolean;
				if (!registerWebhook) {
					clearWebhookState.call(this);
					return true;
				}

				const nodeData = this.getWorkflowStaticData('node');
				const stored = readStoredWebhookState(nodeData);
				if (!stored?.url) {
					return false;
				}

				const desiredUrl = getEffectiveWebhookUrl.call(this);
				if (hasWebhookUrlDrift(stored.url, desiredUrl)) {
					return false;
				}

				const existing = await findWebhookByUrl.call(this, stored.url);
				if (!existing) {
					clearWebhookState.call(this);
					return false;
				}

				storeWebhookState.call(this, assertAutoRegisteredSigningSecret({
					id: existing.id,
					url: existing.url,
					events: Array.isArray(existing.events) ? [...existing.events] : [],
					signingSecret: getWebhookSigningSecret(existing) ?? stored.signingSecret,
				}, this.getNode()));

				return true;
			},
			async create(this: IHookFunctions) {
				const registerWebhook = this.getNodeParameter('registerWebhook') as boolean;
				if (!registerWebhook) {
					clearWebhookState.call(this);
					return true;
				}

				const webhookUrl = getEffectiveWebhookUrl.call(this);
				const events = this.getNodeParameter('events') as string[];
				const stored = readStoredWebhookState(this.getWorkflowStaticData('node'));
				if (stored?.id && stored.url === webhookUrl) {
					const existingByUrl = await findWebhookByUrl.call(this, webhookUrl);
					if (existingByUrl?.id === stored.id) {
						storeWebhookState.call(this, assertAutoRegisteredSigningSecret({
							id: existingByUrl.id,
							url: existingByUrl.url,
							events: Array.isArray(existingByUrl.events) ? [...existingByUrl.events] : events,
							signingSecret: getWebhookSigningSecret(existingByUrl) ?? stored.signingSecret,
						}, this.getNode()));
						return true;
					}
				}

				if (stored?.id && hasWebhookUrlDrift(stored.url, webhookUrl)) {
					const response = await revolutApiRequestWithFullResponse(this, 'DELETE', `/webhooks/${stored.id}`);
					if (response.statusCode !== 204 && !isNotFoundResponse(response)) {
						throw new NodeOperationError(this.getNode(), `Unexpected status when deleting old Revolut webhook ${stored.id}: ${response.statusCode}`);
					}
					clearWebhookState.call(this);
				}

				const existingByUrl = await findWebhookByUrl.call(this, webhookUrl);
				if (existingByUrl) {
					storeWebhookState.call(this, assertAutoRegisteredSigningSecret({
						id: existingByUrl.id,
						url: existingByUrl.url,
						events: Array.isArray(existingByUrl.events) ? [...existingByUrl.events] : events,
						signingSecret: getWebhookSigningSecret(existingByUrl),
					}, this.getNode()));
					return true;
				}

				const response = await revolutApiRequest<{ id: string; signing_secret?: string }>(this, 'POST', '/webhooks', {
					url: webhookUrl,
					...(events.length ? { events } : {}),
				});
				const createdState = {
					id: response.id,
					url: webhookUrl,
					events,
					signingSecret: getWebhookSigningSecret(response),
				};
				if (!hasPersistableSigningSecret(createdState)) {
					try {
						const deleteResponse = await revolutApiRequestWithFullResponse(this, 'DELETE', `/webhooks/${response.id}`);
						if (deleteResponse.statusCode !== 204 && !isNotFoundResponse(deleteResponse)) {
							// Prefer the actionable signing-secret activation failure below over a cleanup-only error.
						}
					} catch {
						// Best-effort cleanup only; keep the root signing-secret failure actionable.
					}
				}

				storeWebhookState.call(this, assertAutoRegisteredSigningSecret(createdState, this.getNode()));
				return true;
			},
			async delete(this: IHookFunctions) {
				const nodeData = this.getWorkflowStaticData('node');
				const registered = readStoredWebhookState(nodeData);
				if (!registered?.id) {
					clearWebhookState.call(this);
					return true;
				}

				const response = await revolutApiRequestWithFullResponse(this, 'DELETE', `/webhooks/${registered.id}`);
				if (response.statusCode !== 204 && !isNotFoundResponse(response)) {
					throw new NodeOperationError(this.getNode(), `Unexpected status when deleting Revolut webhook ${registered.id}: ${response.statusCode}`);
				}

				clearWebhookState.call(this);
				return true;
			},
		},
	};
}
