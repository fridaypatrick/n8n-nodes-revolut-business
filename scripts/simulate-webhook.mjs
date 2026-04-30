#!/usr/bin/env node

import crypto from 'node:crypto';

const webhookUrl = process.env.REVOLUT_WEBHOOK_URL ?? 'http://localhost:5678/webhook/revolut-business';
const signingSecret = process.env.REVOLUT_SIGNING_SECRET ?? 'wsk_test_secret';
const eventName = process.env.REVOLUT_EVENT ?? 'TransactionCreated';

const payload = {
	event: eventName,
	timestamp: new Date().toISOString(),
	data: {
		id: '11111111-2222-3333-4444-555555555555',
		state: 'completed',
		amount: 10,
		currency: 'GBP',
		reference: 'Sandbox simulation',
	},
};

const rawBody = JSON.stringify(payload);
const signature = crypto.createHmac('sha256', signingSecret).update(rawBody).digest('hex');

const response = await fetch(webhookUrl, {
	method: 'POST',
	headers: {
		'content-type': 'application/json',
		'revolut-signature': signature,
	},
	body: rawBody,
});

console.log(JSON.stringify({ webhookUrl, status: response.status, statusText: response.statusText, signature, payload }, null, 2));
