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
	};
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

export class RevolutBusinessWebhookTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Revolut Business Trigger',
		name: 'revolutBusinessWebhookTrigger',
		icon: 'file:revolut.svg',
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
				displayName: 'Webhook URL',
				name: 'webhookUrl',
				type: 'string',
				default: '={{$webhookUrl}}',
				disabledOptions: { show: { operation: ['manual'] } },
				description: 'Use this generated n8n webhook URL when creating or updating the Revolut webhook',
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
				displayName: 'Verify Signature',
				name: 'verifySignature',
				type: 'boolean',
				default: false,
				description: 'Best-effort HMAC verification. Exact Revolut signature header format is assumed and documented in README.',
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
		const verifySignature = this.getNodeParameter('verifySignature') as boolean;

		let signature: IDataObject = { verified: false, skipped: true };
		if (verifySignature) {
			if (!rawBody) {
				throw new NodeOperationError(this.getNode(), 'Webhook signature verification requires the raw request body, but it was not available from n8n for this request');
			}
			const signingSecret = this.getNodeParameter('signingSecret') as string;
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
				const nodeData = this.getWorkflowStaticData('node');
				const stored = readStoredWebhookState(nodeData);
				if (!stored?.url) {
					return false;
				}

				const existing = await findWebhookByUrl.call(this, stored.url);
				if (!existing) {
					clearWebhookState.call(this);
					return false;
				}

				storeWebhookState.call(this, {
					id: existing.id,
					url: existing.url,
					events: Array.isArray(existing.events) ? [...existing.events] : [],
				});

				return true;
			},
			async create(this: IHookFunctions) {
				const registerWebhook = this.getNodeParameter('registerWebhook') as boolean;
				if (!registerWebhook) {
					clearWebhookState.call(this);
					return true;
				}

				const webhookUrl = this.getNodeWebhookUrl('default');
				if (!webhookUrl) {
					throw new NodeOperationError(this.getNode(), 'Could not determine the n8n webhook URL for this trigger');
				}
				const events = this.getNodeParameter('events') as string[];
				const stored = readStoredWebhookState(this.getWorkflowStaticData('node'));
				if (stored?.id && stored.url === webhookUrl) {
					const existingByUrl = await findWebhookByUrl.call(this, webhookUrl);
					if (existingByUrl?.id === stored.id) {
						storeWebhookState.call(this, {
							id: existingByUrl.id,
							url: existingByUrl.url,
							events: Array.isArray(existingByUrl.events) ? [...existingByUrl.events] : events,
						});
						return true;
					}
				}

				const existingByUrl = await findWebhookByUrl.call(this, webhookUrl);
				if (existingByUrl) {
					storeWebhookState.call(this, {
						id: existingByUrl.id,
						url: existingByUrl.url,
						events: Array.isArray(existingByUrl.events) ? [...existingByUrl.events] : events,
					});
					return true;
				}

				const response = await revolutApiRequest<{ id: string }>(this, 'POST', '/webhooks', {
					url: webhookUrl,
					...(events.length ? { events } : {}),
				});

				storeWebhookState.call(this, {
					id: response.id,
					url: webhookUrl,
					events,
				});
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
