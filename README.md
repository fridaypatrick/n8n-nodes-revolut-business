# n8n-nodes-revolut-business

Sandbox-first n8n community node scaffold for Revolut Business webhooks.

## Included in this initial scaffold

- Custom OAuth2 credential for Revolut Business using `private_key_jwt` with `jsonwebtoken`
- Helper script for manual OAuth bootstrap (`npm run revolut:auth`)
- Regular node for webhook management: create / list / get / update / delete, rotate signing secret, list failed events
- Trigger node for receiving Revolut webhook events
- Local `docker-compose.yml` for running n8n with this package mounted as a custom extension
- Local webhook simulation script

## How authentication works

Revolut's `app-confirm` callback does **not** include a `state` parameter, which breaks n8n's built-in generic OAuth2 callback handler. Authentication therefore uses a **manual bootstrap** flow:

1. Run `npm run revolut:auth` — the script opens the Revolut authorization URL, you approve in the browser, paste back the callback URL or code, and the script exchanges it for tokens.
2. Copy the printed **refresh token** into the n8n credential's **Refresh Token** field.
3. The credential uses the refresh token to obtain access tokens at runtime via `private_key_jwt` assertions — no n8n OAuth Connect button is involved.

---

## Credential setup

### 1. Access Revolut Business API settings

1. Log in to [Revolut Business](https://business.revolut.com) (or [sandbox](https://sandbox-business.revolut.com)).
2. Go to **Settings → APIs** (or **Developer → API** depending on your plan).
3. Create a new API application or open an existing one.
4. Note the **Client ID** shown for the application.

### 2. Generate an RSA key pair

**Preferred — use the built-in script:**

```bash
npm run generate:certificate
```

This writes two files under `.revolut/` (already git-ignored):

| File | Purpose |
|------|---------|
| `.revolut/revolut-business-certificate.pem` | Upload to Revolut (public certificate) |
| `.revolut/revolut-business-private-key.pem` | Used by the auth script and pasted into the n8n credential |

**Manual alternative — plain OpenSSL:**

```bash
openssl genrsa -out revolut_private.pem 2048
openssl req -new -x509 -key revolut_private.pem \
  -out revolut_public.cer -days 365 \
  -subj "/CN=n8n-revolut-business"
```

Keep the private key secret. Never commit it to source control.

### 3. Upload the public certificate to Revolut

1. In the Revolut Business API settings for your app, find **Upload certificate** or **API certificate**.
2. Upload `.revolut/revolut-business-certificate.pem` (or `revolut_public.cer` if you used OpenSSL manually).
3. After upload, Revolut shows an **API Certificate ID** (sometimes called `kid`). Copy it.

### 4. Register the redirect URI in Revolut

The redirect URI is used only by the `revolut:auth` helper script to capture the authorization code — it is **not** the n8n generic OAuth callback. You can use any reachable URL you control, including a tunnel URL or a simple local listener.

1. Decide on a redirect URI. For sandbox testing a Cloudflare Tunnel URL works well (e.g. `https://my-n8n-tunnel.example.com/auth/callback`). Any URL is fine as long as you can see the browser redirect.
2. In Revolut Business API settings, add that exact URL as an **Allowed redirect URI**. Revolut requires an exact match — no wildcards.

### 5. Bootstrap the refresh token

Run the auth helper script. All parameters can be passed as CLI flags or `REVOLUT_*` environment variables.

**CLI flags example:**

```bash
npm run revolut:auth -- \
  --client-id YOUR_CLIENT_ID \
  --kid YOUR_CERTIFICATE_ID \
  --jwt-issuer YOUR_ISSUER_DOMAIN \
  --private-key-path .revolut/revolut-business-private-key.pem \
  --redirect-uri https://my-n8n-tunnel.example.com/auth/callback \
  --environment sandbox
```

**Environment variables example:**

```bash
export REVOLUT_CLIENT_ID=your_client_id
export REVOLUT_KID=your_certificate_id
export REVOLUT_JWT_ISSUER=your_issuer_domain
export REVOLUT_PRIVATE_KEY_PATH=.revolut/revolut-business-private-key.pem
export REVOLUT_REDIRECT_URI=https://my-n8n-tunnel.example.com/auth/callback
export REVOLUT_ENVIRONMENT=sandbox   # or production
npm run revolut:auth
```

The script prints an authorization URL. Open it in your browser, approve the request, then paste the resulting callback URL (or just the `code` query parameter value) back into the terminal. On success it prints:

```
Token exchange succeeded. Store this refresh token in the n8n credential:
<refresh_token_value>
```

Copy that value.

### 6. Configure the n8n credential

1. In n8n, go to **Credentials → New → Revolut Business OAuth2 API**.
2. Set **Environment** to **Sandbox** or **Production**.
3. Paste the **Client ID** from step 1.
4. Paste the **API Certificate ID** (`kid`) from step 3 into the **Key ID** field.
5. Paste the full contents of `.revolut/revolut-business-private-key.pem` into the **Private Key** field.
6. Set the **JWT Issuer (iss)** to the exact issuer domain shown in Revolut Business API configuration (no `https://` scheme, no trailing slash).
7. Paste the **Refresh Token** obtained in step 5 into the **Refresh Token** field.

> **Scopes are set at authorization time, not in the credential UI.** The permissions granted to a refresh token are determined by the `--scopes` flag passed to `npm run revolut:auth`. Changing any field in the n8n credential does not alter the scopes of an existing refresh token. For webhook management, always bootstrap with `READ,WRITE`:
> ```bash
> npm run revolut:auth -- --scopes READ,WRITE
> ```
> - `READ` — list/get webhooks and failed events
> - `WRITE` — create/update/delete webhooks and rotate signing secret
>
> The n8n **Test** button refreshes the token and performs a read-only `GET /webhooks` check. It succeeds even without `WRITE`. Webhook auto-registration (`POST /webhooks`) requires `WRITE`; without it the trigger node returns `403 Forbidden` when activating a workflow.

Do **not** click the n8n OAuth Connect button — authentication is driven by the refresh token you pasted.

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
- Sandbox token: `https://sandbox-b2b.revolut.com/api/1.0/auth/token`
- Production token: `https://b2b.revolut.com/api/1.0/auth/token`

## Sandbox setup

1. Create a Revolut Business sandbox app at [sandbox-business.revolut.com](https://sandbox-business.revolut.com).
2. Generate the RSA key pair (`npm run generate:certificate`) and upload the public certificate.
3. Register your redirect URI in Revolut (used by `revolut:auth` script only).
4. Run `npm run revolut:auth` with `--environment sandbox` to obtain a refresh token.
5. In n8n, create the **Revolut Business OAuth2 API** credential, set **Environment** to **Sandbox**, and fill in all fields including the refresh token.

Important:

- Revolut requires exact redirect URI matches per environment.
- Sandbox OAuth callback on `localhost` is acceptable for local testing if you can capture the redirect.
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

## Cloudflare Tunnel (local HTTPS for sandbox testing)

Revolut requires an **exact, registered redirect URI** and delivers webhooks only to reachable HTTPS endpoints. A Cloudflare Tunnel exposes your local Docker n8n instance over a public HTTPS URL without opening firewall ports.

> **Editor stays local.** The n8n editor UI remains at `http://localhost:5678`. Only the redirect URI (for `revolut:auth`) and webhook delivery URLs use the public HTTPS URL.

### Prerequisites

`cloudflared` must be installed and available on your `PATH`. `npm run dev:tunnel` spawns or manages the `cloudflared` process directly — if the binary is missing you will see:

```
Error: spawn cloudflared ENOENT
```

Install `cloudflared` from the [Cloudflare official installation instructions](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) before running any tunnel command.

### Quick tunnel (ephemeral URL)

```bash
npm run dev:tunnel
```

`cloudflared` starts alongside Docker Compose and prints a random `*.trycloudflare.com` URL. Use that URL as the redirect URI when running `revolut:auth`.

**Limitation:** the URL changes every run. You must re-register the redirect URI in Revolut and re-run `revolut:auth` each time. Not recommended for repeated sandbox testing.

### Named tunnel (stable URL — recommended)

#### One-time cloudflared setup (required before first use)

```bash
# 1. Authenticate — opens a browser to authorise your Cloudflare account.
cloudflared tunnel login

# 2. Create the named tunnel (only once per tunnel name).
cloudflared tunnel create my-n8n-tunnel

# 3. Route a DNS hostname to the tunnel (replace with your actual domain).
cloudflared tunnel route dns my-n8n-tunnel my-n8n-tunnel.example.com
```

See the [Cloudflare Tunnel setup guide](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/) for full details.

#### Configure `~/.cloudflared/config.yml`

```yaml
tunnel: my-n8n-tunnel
credentials-file: /Users/<you>/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: my-n8n-tunnel.example.com
    service: http://localhost:5678
  - service: http_status:404
```

Replace `my-n8n-tunnel.example.com` with the hostname you routed in step 3, and `<tunnel-id>` with the UUID printed by `cloudflared tunnel create`.

> **503 / "No ingress rules were defined"?** Add or fix the ingress rule above and restart the tunnel.

> **Origin cert error?** Run `cloudflared tunnel login` to generate the certificate, then retry.

#### Running the named tunnel

```bash
export CLOUDFLARE_TUNNEL_NAME=my-n8n-tunnel
export N8N_WEBHOOK_URL=https://my-n8n-tunnel.example.com
npm run dev:tunnel
```

Register `https://my-n8n-tunnel.example.com/auth/callback` (or any path you choose) once in Revolut as the redirect URI and reuse it across restarts.

#### Using a `.env` file instead of exporting variables

```dotenv
N8N_WEBHOOK_URL=https://my-n8n-tunnel.example.com
CLOUDFLARE_TUNNEL_NAME=my-n8n-tunnel
```

- Shell environment variables take precedence over `.env` values when both are set.
- `.env` is listed in `.gitignore` and must stay local — do not commit it.

### Externally managed tunnel

If `cloudflared` is already running elsewhere, set `N8N_WEBHOOK_URL` to your public URL and omit `CLOUDFLARE_TUNNEL_NAME`. The script will not start a new `cloudflared` process.

```bash
export N8N_WEBHOOK_URL=https://my-n8n-tunnel.example.com
docker compose up
```

### Which mode to use

| Scenario | Recommended mode |
|---|---|
| First-time setup / quick test | Quick tunnel |
| Repeated sandbox development | Named tunnel |
| CI or persistent infra | Externally managed tunnel |

## Trigger node usage

1. Add **Revolut Business Trigger**.
2. Decide whether to enable **Register Webhook Automatically**.
3. If enabled, activate the workflow so the node creates the webhook via API.
4. Optionally enable signature verification and paste the webhook signing secret.

Activation/deactivation notes:

- The trigger stores only minimal webhook lifecycle metadata locally (`id`, `url`, `events`).
- It does not persist Revolut `signing_secret` values in workflow static data or any other non-credential storage.
- Activation reuses an existing remote webhook when one already exists for the same n8n URL, instead of always creating a duplicate.
- Deactivation tolerates a remote `404` and still clears local lifecycle state.

### Gateway / reverse-proxy: Public Webhook URL Template

If n8n sits behind a gateway or reverse proxy that rewrites the external webhook path before it reaches n8n (e.g. `/hooks/revolut-business/<id>` → `/webhook/<id>/revolut-business`), set the **Public Webhook URL Template** field to the external URL pattern your gateway exposes.

**Format:** full HTTPS URL containing exactly one `{webhookId}` placeholder.

**Example:**

```
https://n8n-hooks.whale-gorgon.ts.net/hooks/revolut-business/{webhookId}
```

At production activation the node replaces `{webhookId}` with n8n's generated webhook ID and registers the resulting URL with Revolut.

**Constraints:**

- Must be HTTPS.
- Must contain exactly one `{webhookId}` placeholder.
- Applies to **production activation only** — the Test trigger always uses n8n's native test URL regardless of this field.
- Leave the field empty to use the n8n-generated URL directly (default; no override applied).

**Gateway requirements** (also apply when using any proxy in front of n8n):

- The gateway must forward the raw request body to n8n **unmodified**. Re-encoding or buffering the body breaks Revolut signature verification.
- The `revolut-signature` (or `x-revolut-signature`) header must be forwarded intact.

See the **Security** callout above for additional proxy constraints.

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

- Automatic webhook registration assumes the standard n8n trigger lifecycle for activation/deactivation.
- Signature verification is best-effort until header/encoding details are fully confirmed from live traffic or newer docs.
- This scaffold does not yet implement additional Business API resources beyond webhooks.

## Troubleshooting

**Token exchange returns `401 Unauthorized`**

This almost always means a mismatch between the credential fields and what Revolut has on record. Check:

- The **Private Key** matches the certificate uploaded to Revolut (they must be a pair).
- The **Key ID** (`kid`) exactly matches the **API Certificate ID** shown in Revolut's API settings after upload.
- The **JWT Issuer (iss)** matches the issuer domain shown in Revolut's API configuration (e.g. `my-n8n-tunnel.example.com`). A wrong, missing, or scheme-prefixed value is a common cause of `401` at token exchange.
- The **Client ID** is correct for the environment (sandbox vs. production).

**Refresh token expired or rotated**

Revolut may rotate the refresh token on each use or expire it after a period of inactivity. If API calls start returning `401` or `invalid_grant`:

1. Re-run `npm run revolut:auth` with the same parameters to obtain a new refresh token.
2. Open the n8n credential and replace the **Refresh Token** field value with the new token.
3. Save the credential. No reconnect button is needed.

**Revolut rejects scopes / `invalid_scope` error**

Scopes are set via the `--scopes` flag when running `npm run revolut:auth`, not in the n8n credential UI. Pass them as a comma-separated list (no spaces):

```bash
npm run revolut:auth -- --scopes READ,WRITE
```

The script passes scopes as a single comma-delimited `scope` parameter in the authorization URL:

```
...&scope=READ,WRITE
```

If Revolut rejects the scopes, inspect the authorization URL printed by the script and confirm it contains `scope=READ,WRITE`. If the error persists, re-run `npm run revolut:auth -- --scopes READ,WRITE` to obtain a new refresh token issued with the correct scopes, then paste it into the credential **Refresh Token** field.

**Trigger node returns `403 Forbidden` on workflow activation**

The credential **Test** button refreshes the token and performs a read-only `GET /webhooks` check. It succeeds even without `WRITE`. Webhook auto-registration (POST /webhooks) requires the `WRITE` scope. If you see `403` when activating a workflow with **Register Webhook Automatically** enabled:

1. Re-run `npm run revolut:auth -- --scopes READ,WRITE` to obtain a new refresh token issued with `WRITE`.
2. Paste the new refresh token into the credential **Refresh Token** field and save.
3. Reactivate the workflow.
