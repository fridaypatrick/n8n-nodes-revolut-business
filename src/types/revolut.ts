export const REVOLUT_ENVIRONMENTS = {
	sandbox: 'https://sandbox-b2b.revolut.com/api/2.0',
	production: 'https://b2b.revolut.com/api/2.0',
} as const;

export type RevolutEnvironment = keyof typeof REVOLUT_ENVIRONMENTS;

export const WEBHOOK_EVENT_TYPES = [
	'TransactionCreated',
	'TransactionStateChanged',
	'PayoutLinkCreated',
	'PayoutLinkStateChanged',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface RevolutWebhook {
	id: string;
	url: string;
	events: WebhookEventType[];
	signing_secret?: string;
}

export interface StoredRevolutWebhookLifecycle {
	id: string;
	url: string;
	events: string[];
}

export interface RevolutFailedWebhookEvent {
	id: string;
	created_at: string;
	updated_at: string;
	webhook_id: string;
	webhook_url: string;
	payload: Record<string, unknown>;
	last_sent_date?: string;
}
