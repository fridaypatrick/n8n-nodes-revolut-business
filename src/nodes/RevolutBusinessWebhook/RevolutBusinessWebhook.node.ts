import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { REVOLUT_WEBHOOK_DEFAULT_EVENTS, revolutWebhookEventOptions } from '../../helpers/constants';
import { revolutApiRequest, revolutApiRequestWithFullResponse } from '../../helpers/revolutApi';

export class RevolutBusinessWebhook implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Revolut Business Webhook',
		name: 'revolutBusinessWebhook',
		icon: 'file:bank-icon.svg',
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Manage Revolut Business webhooks',
		defaults: {
			name: 'Revolut Business Webhook',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'revolutBusinessOAuth2Api',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				default: 'getAll',
				noDataExpression: true,
				options: [
					{ name: 'Create', value: 'create', action: 'Create a webhook' },
					{ name: 'Delete', value: 'delete', action: 'Delete a webhook' },
					{ name: 'Get', value: 'get', action: 'Get a webhook' },
					{ name: 'Get Many', value: 'getAll', action: 'Get many webhooks' },
					{ name: 'Get Failed Events', value: 'getFailedEvents', action: 'Get failed webhook events' },
					{ name: 'Rotate Signing Secret', value: 'rotateSigningSecret', action: 'Rotate webhook signing secret' },
					{ name: 'Update', value: 'update', action: 'Update a webhook' },
				],
			},
			{
				displayName: 'Webhook ID',
				name: 'webhookId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['get', 'update', 'delete', 'rotateSigningSecret', 'getFailedEvents'],
					},
				},
			},
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['create'],
					},
				},
				description: 'HTTPS webhook URL registered in Revolut',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				options: revolutWebhookEventOptions ?? [],
				default: REVOLUT_WEBHOOK_DEFAULT_EVENTS,
				displayOptions: {
					show: {
						operation: ['create', 'update'],
					},
				},
				description: 'Leave defaults for core transaction notifications',
			},
			{
				displayName: 'Update Fields',
				name: 'updateFields',
				type: 'collection',
				default: {},
				placeholder: 'Add Field',
				displayOptions: {
					show: {
						operation: ['update'],
					},
				},
				options: [
					{
						displayName: 'URL',
						name: 'url',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Events',
						name: 'events',
						type: 'multiOptions',
						options: revolutWebhookEventOptions ?? [],
						default: [],
					},
				],
			},
			{
				displayName: 'Expiration Period',
				name: 'expirationPeriod',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['rotateSigningSecret'],
					},
				},
				description: 'Optional ISO 8601 duration such as PT5H30M or P1D',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 100,
				typeOptions: { minValue: 1 },
				description: 'Maximum number of failed events to return per page (1-1000)',
				displayOptions: {
					show: {
						operation: ['getFailedEvents'],
					},
				},
			},
			{
				displayName: 'Created Before',
				name: 'createdBefore',
				type: 'dateTime',
				default: '',
				displayOptions: {
					show: {
						operation: ['getFailedEvents'],
					},
				},
				description: 'Pagination/filter field based on the last returned event creation date',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			const operation = this.getNodeParameter('operation', itemIndex) as string;
			let responseData: IDataObject | IDataObject[] | undefined;

			if (operation === 'create') {
				const url = this.getNodeParameter('url', itemIndex) as string;
				const events = this.getNodeParameter('events', itemIndex, []) as string[];
				responseData = await revolutApiRequest(this, 'POST', '/webhooks', { url, ...(events.length ? { events } : {}) });
			} else if (operation === 'getAll') {
				responseData = await revolutApiRequest(this, 'GET', '/webhooks');
			} else if (operation === 'get') {
				const webhookId = this.getNodeParameter('webhookId', itemIndex) as string;
				responseData = await revolutApiRequest(this, 'GET', `/webhooks/${webhookId}`);
			} else if (operation === 'delete') {
				const webhookId = this.getNodeParameter('webhookId', itemIndex) as string;
				const response = await revolutApiRequestWithFullResponse(this, 'DELETE', `/webhooks/${webhookId}`);
				responseData = { success: response.statusCode === 204, webhookId, statusCode: response.statusCode };
			} else if (operation === 'update') {
				const webhookId = this.getNodeParameter('webhookId', itemIndex) as string;
				const updateFields = this.getNodeParameter('updateFields', itemIndex, {}) as IDataObject;
				if (!Object.keys(updateFields).length) {
					throw new NodeOperationError(this.getNode(), 'Provide at least one update field: URL or events', {
						itemIndex,
					});
				}
				responseData = await revolutApiRequest(this, 'PATCH', `/webhooks/${webhookId}`, updateFields);
			} else if (operation === 'rotateSigningSecret') {
				const webhookId = this.getNodeParameter('webhookId', itemIndex) as string;
				const expirationPeriod = this.getNodeParameter('expirationPeriod', itemIndex, '') as string;
				responseData = await revolutApiRequest(this, 'POST', `/webhooks/${webhookId}/rotate-signing-secret`, expirationPeriod ? { expiration_period: expirationPeriod } : {});
			} else if (operation === 'getFailedEvents') {
				const webhookId = this.getNodeParameter('webhookId', itemIndex) as string;
				const limit = this.getNodeParameter('limit', itemIndex) as number;
				if (limit < 1 || limit > 1000) {
					throw new NodeOperationError(this.getNode(), 'Limit must be between 1 and 1000', { itemIndex });
				}
				const createdBefore = this.getNodeParameter('createdBefore', itemIndex, '') as string;
				responseData = await revolutApiRequest(this, 'GET', `/webhooks/${webhookId}/failed-events`, undefined, {
					limit,
					...(createdBefore ? { created_before: createdBefore } : {}),
				});
			}

			const executionData = this.helpers.constructExecutionMetaData(
				this.helpers.returnJsonArray(Array.isArray(responseData) ? responseData : [responseData ?? {}]),
				{ itemData: { item: itemIndex } },
			);
			returnData.push(...executionData);
		}

		return [returnData];
	}
}
