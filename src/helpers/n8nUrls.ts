export interface N8nHostingContext {
	protocol?: string;
	host?: string;
	port?: number | string;
	path?: string;
	webhookUrl?: string;
	editorBaseUrl?: string;
}

function trimSlashes(value: string): string {
	return value.replace(/^\/+|\/+$/g, '');
}

function ensureTrailingSlash(value: string): string {
	return value.endsWith('/') ? value : `${value}/`;
}

export function deriveBaseUrl(context: N8nHostingContext): string {
	if (context.webhookUrl) {
		return ensureTrailingSlash(context.webhookUrl);
	}

	if (context.editorBaseUrl) {
		return ensureTrailingSlash(context.editorBaseUrl);
	}

	const protocol = context.protocol ?? 'http';
	const host = context.host ?? 'localhost';
	const port = context.port ? `:${String(context.port)}` : '';
	const path = context.path ? `${trimSlashes(context.path)}/` : '';

	return `${protocol}://${host}${port}/${path}`;
}

export function deriveOauthCallbackUrl(context: N8nHostingContext, credentialName = 'revolutBusinessOAuth2Api'): string {
	return new URL(`rest/oauth2-credential/callback`, deriveBaseUrl(context)).toString() + `?cid=${credentialName}`;
}
