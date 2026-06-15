import type { INodeProperties } from 'n8n-workflow';

import { WEBHOOK_EVENT_TYPES } from '../types/revolut';

export const REVOLUT_WEBHOOK_DEFAULT_EVENTS = ['TransactionCreated', 'TransactionStateChanged'];

export const REVOLUT_WEBHOOK_HTTP_PATH = 'revolut-business';

export const REVOLUT_SIGNATURE_HEADER_NAMES = ['revolut-signature', 'x-revolut-signature'] as const;

export const REVOLUT_REQUEST_TIMESTAMP_HEADER_NAME = 'revolut-request-timestamp';

export const revolutWebhookEventOptions: INodeProperties['options'] = WEBHOOK_EVENT_TYPES.map((event) => ({
	name: event,
	value: event,
}));
