import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	ILoadOptionsFunctions,
	IN8nHttpFullResponse,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { ApplicationError } from 'n8n-workflow';

import type { RevolutEnvironment } from '../types/revolut';
import { REVOLUT_ENVIRONMENTS } from '../types/revolut';

type RequestContext = IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions | IWebhookFunctions;

const WEBHOOK_WRITE_SCOPE_HINT = 'Revolut webhook write operations require the WRITE OAuth scope. Re-run `npm run revolut:auth` with READ,WRITE scopes and paste the new refresh token into this credential.';

export function getBaseUrl(environment: RevolutEnvironment): string {
	return REVOLUT_ENVIRONMENTS[environment];
}

export async function getCredentialEnvironment(ctx: RequestContext, credentialType = 'revolutBusinessOAuth2Api'): Promise<RevolutEnvironment> {
	const data = await ctx.getCredentials(credentialType) as { environment?: RevolutEnvironment };
	return data.environment === 'production' ? 'production' : 'sandbox';
}

export async function revolutApiRequest<T = IDataObject | IDataObject[]>(
	ctx: RequestContext,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
	endpoint: string,
	body?: IDataObject,
	qs?: IDataObject,
	ignoreHttpStatusErrors = false,
): Promise<T> {
	const environment = await getCredentialEnvironment(ctx);
	const baseURL = getBaseUrl(environment);

	try {
		return await ctx.helpers.httpRequestWithAuthentication.call(ctx, 'revolutBusinessOAuth2Api', {
			method,
			baseURL,
			url: endpoint,
			qs,
			body,
			returnFullResponse: ignoreHttpStatusErrors,
			ignoreHttpStatusErrors,
		});
	} catch (error) {
		throw new ApplicationError(buildRevolutApiErrorMessage(error, method, endpoint), {
			extra: { endpoint, method, baseURL },
		});
	}
}

export function buildRevolutApiErrorMessage(
	error: unknown,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
	endpoint: string,
): string {
	const message = error instanceof Error ? error.message : String(error);
	const statusCode = getErrorStatusCode(error);
	const isWebhookWrite = endpoint.startsWith('/webhooks') && method !== 'GET';
	const isForbidden = statusCode === 403 || /\bforbidden\b/i.test(message);
	const scopeHint = isForbidden && isWebhookWrite ? ` ${WEBHOOK_WRITE_SCOPE_HINT}` : '';

	return `Revolut Business API request failed: ${message}.${scopeHint}`;
}

function getErrorStatusCode(error: unknown): number | undefined {
	if (!error || typeof error !== 'object') {
		return undefined;
	}

	const candidate = error as { statusCode?: unknown; httpCode?: unknown; response?: { statusCode?: unknown; status?: unknown } };
	const statusCode = candidate.statusCode ?? candidate.httpCode ?? candidate.response?.statusCode ?? candidate.response?.status;
	if (typeof statusCode === 'number') {
		return statusCode;
	}
	if (typeof statusCode === 'string') {
		const parsed = Number.parseInt(statusCode, 10);
		return Number.isNaN(parsed) ? undefined : parsed;
	}
	return undefined;
}

export async function revolutApiRequestWithFullResponse(
	ctx: RequestContext,
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
	endpoint: string,
	body?: IDataObject,
	qs?: IDataObject,
): Promise<IN8nHttpFullResponse> {
	return (await revolutApiRequest(ctx, method, endpoint, body, qs, true)) as unknown as IN8nHttpFullResponse;
}

export function isNotFoundResponse(response: IN8nHttpFullResponse | undefined): boolean {
	return response?.statusCode === 404;
}

export function normaliseWebhookHeaders(headers: JsonObject | undefined): Record<string, string> {
	const normalised: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers ?? {})) {
		if (typeof value === 'string') {
			normalised[key.toLowerCase()] = value;
		}
	}
	return normalised;
}
