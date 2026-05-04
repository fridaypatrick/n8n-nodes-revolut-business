#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const tunnelUrlPattern = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseDotEnv(contents) {
	const values = {};

	for (const line of contents.split(/\r?\n/)) {
		const trimmedLine = line.trim();

		if (!trimmedLine || trimmedLine.startsWith('#')) {
			continue;
		}

		const separatorIndex = trimmedLine.indexOf('=');

		if (separatorIndex === -1) {
			continue;
		}

		const key = trimmedLine.slice(0, separatorIndex).trim();

		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
			continue;
		}

		let value = trimmedLine.slice(separatorIndex + 1).trim();
		const quote = value[0];

		if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
			value = value.slice(1, -1);
		}

		values[key] = value;
	}

	return values;
}

function loadDotEnv() {
	const envPath = resolve(repoRoot, '.env');

	if (!existsSync(envPath)) {
		return;
	}

	const values = parseDotEnv(readFileSync(envPath, 'utf8'));

	for (const [key, value] of Object.entries(values)) {
		if (process.env[key] === undefined) {
			process.env[key] = value;
		}
	}
}

loadDotEnv();

if (process.argv.includes('--help') || process.argv.includes('-h')) {
	console.log(`Usage: npm run dev:tunnel

Starts Docker Compose for local n8n with a webhook URL suitable for Revolut
Business webhooks.

Modes:
  Quick tunnel (zero config):
    If no environment variables are set, starts:
      cloudflared tunnel --url http://localhost:5678
    The generated trycloudflare.com URL is parsed from cloudflared output and
    passed to Docker Compose as N8N_WEBHOOK_URL and, unless explicitly set,
    N8N_EDITOR_BASE_URL.

  Named Cloudflare tunnel (stable URL):
    If both CLOUDFLARE_TUNNEL_NAME and N8N_WEBHOOK_URL are set, starts:
      cloudflared tunnel run <name>
    Docker Compose uses the configured N8N_WEBHOOK_URL and, unless explicitly
    set, the same value for N8N_EDITOR_BASE_URL. N8N_WEBHOOK_URL is required
    because named tunnels do not necessarily print their public hostname.
    Before using this mode, authenticate and configure cloudflared for the
    tunnel (for example: cloudflared tunnel login, plus the origin certificate
    or tunnel credentials required by cloudflared tunnel run).

  Managed external tunnel:
    If N8N_WEBHOOK_URL is set and CLOUDFLARE_TUNNEL_NAME is not set, skips
    cloudflared and runs Docker Compose with the provided N8N_WEBHOOK_URL and,
    unless explicitly set, the same value for N8N_EDITOR_BASE_URL.

Environment variables:
  CLOUDFLARE_TUNNEL_NAME  Optional named Cloudflare tunnel to run. Leave unset
                          for the default quick/random trycloudflare tunnel.
  N8N_WEBHOOK_URL         Public webhook base URL. Required for named tunnels;
                          when set without CLOUDFLARE_TUNNEL_NAME, the tunnel
                          is assumed to be externally managed. A trailing slash
                          is added automatically.
  N8N_EDITOR_BASE_URL     Base URL n8n may use to generate OAuth callback URLs.
                          For Revolut OAuth this may need to be the public
                          HTTPS tunnel URL. If unset, this script passes the
                          normalized N8N_WEBHOOK_URL/tunnel URL. Docker Compose
                          defaults it to http://localhost:5678/ otherwise.

Local .env support:
  A gitignored .env file in the repo root may define CLOUDFLARE_TUNNEL_NAME,
  N8N_WEBHOOK_URL, and N8N_EDITOR_BASE_URL. Explicit shell environment
  variables take precedence.

Examples:
  npm run dev:tunnel
  N8N_WEBHOOK_URL=https://hooks.example.com npm run dev:tunnel
  CLOUDFLARE_TUNNEL_NAME=my-n8n-tunnel N8N_WEBHOOK_URL=https://hooks.example.com npm run dev:tunnel

OAuth callback generation may require N8N_EDITOR_BASE_URL to be public HTTPS.
Open the n8n editor locally at http://localhost:5678`);
	process.exit(0);
}

let cloudflared;
let compose;
let shuttingDown = false;
let composeDownStarted = false;

function normalizeWebhookUrl(webhookUrl) {
	return webhookUrl.endsWith('/') ? webhookUrl : `${webhookUrl}/`;
}

function stopChild(child, name) {
	if (!child || child.exitCode !== null || child.signalCode !== null) {
		return;
	}

	console.log(`Stopping ${name}...`);
	child.kill('SIGTERM');

	setTimeout(() => {
		if (child.exitCode === null && child.signalCode === null) {
			child.kill('SIGKILL');
		}
	}, 5_000).unref();
}

function runComposeDown() {
	if (composeDownStarted) {
		return Promise.resolve();
	}

	composeDownStarted = true;
	console.log('Stopping Docker Compose containers...');

	return new Promise((resolveDown) => {
		const down = spawn('docker', ['compose', 'down', '--remove-orphans'], {
			cwd: repoRoot,
			stdio: 'inherit',
			env: process.env,
		});

		let finished = false;
		const timeout = setTimeout(() => {
			if (finished) {
				return;
			}

			console.error('Timed out waiting for Docker Compose down; killing cleanup process.');
			down.kill('SIGKILL');
		}, 20_000);

		const finish = () => {
			if (finished) {
				return;
			}

			finished = true;
			clearTimeout(timeout);
			resolveDown();
		};

		down.on('error', (error) => {
			console.error(`Failed to run Docker Compose cleanup: ${error.message}`);
			finish();
		});

		down.on('exit', finish);
	});
}

async function shutdown(signal, { exitAfterCleanup = false, exitCode } = {}) {
	if (shuttingDown) {
		return;
	}

	shuttingDown = true;
	if (signal) {
		console.log(`Received ${signal}; shutting down...`);
	}
	stopChild(compose, 'Docker Compose');
	stopChild(cloudflared, 'cloudflared');
	await runComposeDown();

	if (exitCode !== undefined) {
		process.exitCode = exitCode;
	}

	if (exitAfterCleanup) {
		process.exit(process.exitCode ?? 0);
	}
}

function startDockerCompose(webhookUrl) {
	const normalizedWebhookUrl = normalizeWebhookUrl(webhookUrl);
	const editorBaseUrl = process.env.N8N_EDITOR_BASE_URL ?? normalizedWebhookUrl;

	console.log(`\nN8N_WEBHOOK_URL: ${normalizedWebhookUrl}`);
	console.log(`N8N_EDITOR_BASE_URL: ${editorBaseUrl}`);
	console.log('Open the n8n editor locally at http://localhost:5678');
	console.log('Starting Docker Compose in the foreground...\n');

	compose = spawn('docker', ['compose', 'up'], {
		cwd: repoRoot,
		stdio: 'inherit',
		env: {
			...process.env,
			N8N_WEBHOOK_URL: normalizedWebhookUrl,
			N8N_EDITOR_BASE_URL: editorBaseUrl,
		},
	});

	compose.on('error', (error) => {
		console.error(`Failed to start Docker Compose: ${error.message}`);
		process.exitCode = 1;
		void shutdown(undefined, { exitCode: 1 });
	});

	compose.on('exit', (code, signal) => {
		if (signal) {
			process.exitCode = 1;
		} else {
			process.exitCode = code ?? 0;
		}

		void shutdown(undefined, { exitCode: process.exitCode });
	});
}

function handleCloudflaredOutput(data) {
	const text = data.toString();
	process.stdout.write(text);

	if (compose) {
		return;
	}

	const match = text.match(tunnelUrlPattern);
	if (match) {
		startDockerCompose(match[0]);
	}
}

process.on('SIGINT', () => void shutdown('SIGINT', { exitAfterCleanup: true, exitCode: 130 }));
process.on('SIGTERM', () => void shutdown('SIGTERM', { exitAfterCleanup: true, exitCode: 143 }));

const tunnelName = process.env.CLOUDFLARE_TUNNEL_NAME;
const webhookUrl = process.env.N8N_WEBHOOK_URL;

if (tunnelName) {
	if (!webhookUrl) {
		console.error('N8N_WEBHOOK_URL is required when CLOUDFLARE_TUNNEL_NAME is set.');
		process.exit(1);
	}

	console.log(`Starting named Cloudflare Tunnel "${tunnelName}"...`);
	cloudflared = spawn('cloudflared', ['tunnel', 'run', tunnelName], {
		stdio: 'inherit',
	});

	cloudflared.on('error', (error) => {
		console.error(`Failed to start cloudflared: ${error.message}`);
		process.exitCode = 1;
	});

	cloudflared.on('exit', (code, signal) => {
		if (!shuttingDown) {
			console.error(`cloudflared exited; stopping Docker Compose${signal ? ` (${signal})` : code === null ? '' : ` (code ${code})`}.`);
			process.exitCode = code ?? 1;
			void shutdown(undefined, { exitCode: process.exitCode });
		}
	});

	startDockerCompose(webhookUrl);
} else if (webhookUrl) {
	console.log('Using externally managed tunnel from N8N_WEBHOOK_URL; cloudflared will not be started.');
	startDockerCompose(webhookUrl);
} else {
	console.log('Starting Cloudflare Tunnel for http://localhost:5678...');

	cloudflared = spawn('cloudflared', ['tunnel', '--url', 'http://localhost:5678'], {
		stdio: ['ignore', 'pipe', 'pipe'],
	});

	cloudflared.stdout.on('data', handleCloudflaredOutput);
	cloudflared.stderr.on('data', handleCloudflaredOutput);

	cloudflared.on('error', (error) => {
		console.error(`Failed to start cloudflared: ${error.message}`);
		process.exitCode = 1;
	});

	cloudflared.on('exit', (code, signal) => {
		if (!shuttingDown && !compose) {
			console.error(`cloudflared exited before a tunnel URL was found${signal ? ` (${signal})` : code === null ? '' : ` (code ${code})`}.`);
			process.exitCode = code ?? 1;
		}

		if (!shuttingDown && compose) {
			console.error('cloudflared exited; stopping Docker Compose.');
			process.exitCode = code ?? 1;
			void shutdown(undefined, { exitCode: process.exitCode });
		}
	});
}
