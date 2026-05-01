#!/usr/bin/env node

import { spawn } from 'node:child_process';

const tunnelUrlPattern = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;

if (process.argv.includes('--help') || process.argv.includes('-h')) {
	console.log(`Usage: npm run dev:tunnel

Starts a Cloudflare quick tunnel for local n8n webhooks, then runs Docker Compose
in the foreground with N8N_WEBHOOK_URL set to the generated tunnel URL.

Open the n8n editor locally at http://localhost:5678`);
	process.exit(0);
}

let cloudflared;
let compose;
let shuttingDown = false;

function stopChild(child, name) {
	if (!child || child.killed || child.exitCode !== null || child.signalCode !== null) {
		return;
	}

	console.log(`Stopping ${name}...`);
	child.kill('SIGTERM');

	setTimeout(() => {
		if (!child.killed && child.exitCode === null && child.signalCode === null) {
			child.kill('SIGKILL');
		}
	}, 5_000).unref();
}

function shutdown(signal) {
	if (shuttingDown) {
		return;
	}

	shuttingDown = true;
	if (signal) {
		console.log(`Received ${signal}; shutting down...`);
	}
	stopChild(compose, 'Docker Compose');
	stopChild(cloudflared, 'cloudflared');
}

function startDockerCompose(tunnelUrl) {
	const webhookUrl = `${tunnelUrl}/`;

	console.log(`\nCloudflare Tunnel URL: ${webhookUrl}`);
	console.log('Open the n8n editor locally at http://localhost:5678');
	console.log('Starting Docker Compose in the foreground...\n');

	compose = spawn('docker', ['compose', 'up'], {
		stdio: 'inherit',
		env: {
			...process.env,
			N8N_WEBHOOK_URL: webhookUrl,
		},
	});

	compose.on('error', (error) => {
		console.error(`Failed to start Docker Compose: ${error.message}`);
		shutdown();
		process.exitCode = 1;
	});

	compose.on('exit', (code, signal) => {
		shutdown();
		if (signal) {
			process.exitCode = 1;
			return;
		}
		process.exitCode = code ?? 0;
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

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

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
		shutdown();
		process.exitCode = code ?? 1;
	}
});
