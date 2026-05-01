# n8n-nodes-revolut-business

Sandbox-first n8n community node scaffold for Revolut Business webhooks.

## Included in this initial scaffold

- OAuth2 credential for Revolut Business using `private_key_jwt` with `jsonwebtoken`
- Regular node for webhook management: create / list / get / update / delete, rotate signing secret, list failed events
- Trigger node for receiving Revolut webhook events
- Local `docker-compose.yml` for running n8n with this package mounted as a custom extension
- Local webhook simulation script

## Production credential setup

### 1. Access Revolut Business API settings

1. Log in to [Revolut Business](https://business.revolut.com).
2. Go to **Settings → APIs** (or **Developer → API** depending on your plan).
3. Create a new API application or open an existing one.
4. Note the **Client ID** shown for the application.

### 2. Generate an RSA key pair locally

**Preferred — use the built-in script:**

```bash
npm run generate:certificate
```

This writes two files under `.revolut/` (already git-ignored):

| File | Purpose |
|------|---------|
| `.revolut/revolut-business-certificate.pem` | Upload to Revolut (public certificate) |
| `.revolut/revolut-business-private-key.pem` | Paste into the n8n credential (private key) |

**Manual alternative — plain OpenSSL:**

```bash
# Generate 2048-bit private key
openssl genrsa -out revolut_private.pem 2048

# Derive the public certificate (self-signed, 1-year validity)
openssl req -new -x509 -key revolut_private.pem \
  -out revolut_public.cer -days 365 \
  -subj "/CN=n8n-revolut-business"
```

Keep the private key secret. Never commit it to source control.

### 3. Upload the public certificate to Revolut

1. In the Revolut Business API settings for your app, find **Upload certificate** or **API certificate**.
2. Upload `.revolut/revolut-business-certificate.pem` (or `revolut_public.cer` if you used OpenSSL manually).
3. After upload, Revolut shows an **API Certificate ID** (sometimes called `kid`). Copy it.

### 4. Configure the n8n credential

1. In n8n, go to **Credentials → New → Revolut Business OAuth2 API**.
2. Set **Environment** to **Production**.
3. Paste the **Client ID** from step 1.
4. Paste the **API Certificate ID** (kid) from step 3.
5. Paste the full contents of `.revolut/revolut-business-private-key.pem` (or `revolut_private.pem` if you used OpenSSL manually) into the **Private Key** field.
6. Set **Scopes** to the permissions your workflows need. For webhook management use at minimum:
   - `READ` — list/get webhooks and failed events
   - `WRITE` — create/update/delete webhooks and rotate signing secret

### 5. Register the OAuth redirect URI

1. In n8n, open the credential you just created. The credential form shows the **OAuth Redirect URL** (e.g. `https://your-n8n-host/rest/oauth2-credential/callback`).
2. Ensure n8n's public base URL is set correctly via `N8N_EDITOR_BASE_URL` or `WEBHOOK_URL` so the callback URL is reachable from the internet.
3. Copy the exact callback URL shown by n8n.
4. In Revolut Business API settings, add that exact URL as an **Allowed redirect URI**. Revolut requires an exact match — no wildcards.

### 6. Complete the OAuth consent flow

1. Click **Connect** (or **Sign in with Revolut**) in the n8n credential.
2. You are redirected to `https://business.revolut.com/app-confirm`. Log in and grant consent.
3. n8n exchanges the authorization code for tokens automatically. The credential status changes to **Connected**.

### 7. Create or manage webhooks

- Use the **Revolut Business** node to create/list/update/delete webhooks and rotate signing secrets manually.
- Use the **Revolut Business Trigger** node with **Register Webhook Automatically** enabled; activating the workflow creates the webhook and deactivating it removes it.

---

> **Security — exposing n8n's webhook endpoint publicly**
>
> - Always serve the webhook endpoint over **HTTPS**. Revolut will not deliver events to plain HTTP in production.
> - Restrict access to the n8n editor UI (firewall, VPN, or basic auth). Do not expose the editor to the public internet.
> - Do not expose unnecessary n8n paths; only the webhook path used by Revolut needs to be publicly reachable.
> - Enable **signature verification** in the trigger node and keep the signing secret confidential. If the secret is leaked, rotate it immediately via the node or Revolut dashboard.
> - The trigger verifies signatures against the **raw request body**. Do not place a proxy in front of n8n that re-encodes or modifies the body before it reaches n8n, as this breaks verification.
> - Apply network-level controls (IP allowlisting, WAF rules) where your infrastructure supports it.

---

## Revolut environment URLs

- Sandbox authorize: `https://sandbox-business.revolut.com/app-confirm`
- Production authorize: `https://business.revolut.com/app-confirm`
- Sandbox token: `https://sandbox-business.revolut.com/api/1.0/auth/token`
- Production token: `https://business.revolut.com/api/1.0/auth/token`

## Sandbox setup

1. Create a Revolut Business sandbox app at [sandbox-business.revolut.com](https://sandbox-business.revolut.com).
2. Generate or upload the RSA key pair expected by Revolut (same `openssl` commands as production above).
3. In n8n, create the **Revolut Business OAuth2 API** credential and set **Environment** to **Sandbox**.
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

#### Local test account

The development image auto-provisions a local owner account on first start via the `N8N_INSTANCE_OWNER_*` environment variables set in `docker-compose.yml`. This account is **local-development only**.

| Field    | Value                   |
|----------|-------------------------|
| URL      | `http://localhost:5678` |
| Email    | `admin@example.com`     |
| Password | `N8n-dev-password`      |

> **Warning:** These credentials are provisioned by the docker-compose instance-owner env vars for local development only. Do not reuse them in any staging or production environment.

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
