# n8n-nodes-revolut-business

Sandbox-first n8n community node scaffold for Revolut Business webhooks.

## Included in this initial scaffold

- OAuth2 credential for Revolut Business using `private_key_jwt` with `jsonwebtoken`
- Regular node for webhook management
- Trigger node for receiving Revolut webhook events
- Local `docker-compose.yml` for running n8n with this package mounted as a custom extension
- Local webhook simulation script

## Supported scope

This first version only implements:

- OAuth credential setup
- Webhook create/list/get/update/delete
- Rotate signing secret
- List failed webhook events
- Receive webhook trigger flow

## Revolut environment URLs

- Sandbox authorize: `https://sandbox-business.revolut.com/app-confirm`
- Production authorize: `https://business.revolut.com/app-confirm`
- Sandbox token: `https://sandbox-business.revolut.com/api/1.0/auth/token`
- Production token: `https://business.revolut.com/api/1.0/auth/token`

## Sandbox setup

1. Create a Revolut Business sandbox app.
2. Generate or upload the RSA key pair expected by Revolut.
3. In n8n, create the **Revolut Business OAuth2 API** credential.
4. Register the **exact** OAuth redirect URI shown by n8n in Revolut.

Important:

- Revolut requires exact redirect URI matches per environment.
- n8n derives its callback URL from hosting config such as `WEBHOOK_URL`, `N8N_EDITOR_BASE_URL`, `N8N_HOST`, `N8N_PROTOCOL`, and `N8N_PORT`.
- Sandbox OAuth callback on `localhost` is acceptable for local testing.
- Real Revolut webhook delivery to `localhost` is generally not usable from Revolut's servers; use a tunnel or public HTTPS endpoint when testing live webhook delivery.

## Local run

### Run directly

```bash
npm install
npm run build
```

### Run n8n with Docker Compose

```bash
docker compose up
```

This mounts the current package into n8n as a custom extension, installs dependencies in the container, builds the package, and starts n8n on `http://localhost:5678`.

## Local OAuth callback expectation

For the Docker setup here, n8n is configured around `http://localhost:5678/`, so the callback URL will be derived from that host context. In practice, confirm the exact callback shown by n8n and register that exact value in Revolut.

## Trigger node usage

1. Add **Revolut Business Trigger**.
2. Decide whether to enable **Register Webhook Automatically**.
3. If enabled, activate the workflow so the node creates the webhook via API.
4. Optionally enable signature verification and paste the webhook signing secret.

Activation/deactivation notes:

- The trigger now stores only minimal webhook lifecycle metadata locally (`id`, `url`, `events`).
- It does not persist Revolut `signing_secret` values in workflow static data or any other non-credential storage.
- Activation reuses an existing remote webhook when one already exists for the same n8n URL, instead of always creating a duplicate.
- Deactivation tolerates a remote `404` and still clears local lifecycle state.

## Simulate a webhook locally

```bash
npm run simulate:webhook
```

Optional env vars:

```bash
REVOLUT_WEBHOOK_URL=http://localhost:5678/webhook/revolut-business \
REVOLUT_SIGNING_SECRET=wsk_test_secret \
REVOLUT_EVENT=TransactionCreated \
npm run simulate:webhook
```

## Signature verification assumption

Revolut signature verification is implemented behind a dedicated helper and currently assumes:

- signature header is `revolut-signature` or `x-revolut-signature`
- signature value is a lowercase hex HMAC-SHA256 digest
- digest input is the raw request body

Verification fails closed when n8n does not expose the raw request body for the incoming webhook request. In that case the trigger returns a clear error rather than attempting to verify a reserialized JSON body.

If Revolut documents a different header name or encoding for your account/version, adjust `src/helpers/webhookSignature.ts`.

## Limitations / TODO

- OAuth callback URL is derived from n8n hosting configuration, not manually overridden by this package.
- OAuth still depends on n8n's generic OAuth2 credential flow invoking `preAuthentication` on both token exchange and refresh so a fresh `private_key_jwt` can be supplied each time.
- Automatic webhook registration assumes the standard n8n trigger lifecycle for activation/deactivation.
- Signature verification is best-effort until header/encoding details are fully confirmed from live traffic or newer docs.
- This scaffold does not yet implement additional Business API resources beyond webhooks.
