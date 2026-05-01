#!/usr/bin/env node

import { chmod, mkdir } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

const outputDir = resolve(process.env.REVOLUT_CERT_DIR ?? '.revolut');
const commonName = process.env.REVOLUT_CERT_COMMON_NAME ?? 'n8n-revolut-business-local';
const validityDays = process.env.REVOLUT_CERT_DAYS ?? '365';
const privateKeyPath = resolve(outputDir, 'revolut-business-private-key.pem');
const certificatePath = resolve(outputDir, 'revolut-business-certificate.pem');

if (!/^\d+$/.test(validityDays) || Number(validityDays) < 1) {
  throw new Error('REVOLUT_CERT_DAYS must be a positive integer');
}

await mkdir(outputDir, { recursive: true });

await execFile('openssl', [
  'req',
  '-x509',
  '-newkey',
  'rsa:2048',
  '-nodes',
  '-sha256',
  '-days',
  validityDays,
  '-subj',
  `/CN=${commonName.replaceAll('/', '\\/')}`,
  '-keyout',
  privateKeyPath,
  '-out',
  certificatePath,
], { stdio: 'inherit' });

await chmod(privateKeyPath, 0o600);

console.log('\nGenerated Revolut Business API certificate files:');
console.log(`  Private key: ${privateKeyPath}`);
console.log(`  Certificate: ${certificatePath}`);
console.log('\nUpload the certificate file to Revolut. Keep the private key secret and do not commit it.');
