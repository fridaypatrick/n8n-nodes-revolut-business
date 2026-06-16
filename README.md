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
> - In **auto-register mode** the trigger always verifies incoming signatures using the Revolut-generated signing secret stored at activation time — no manual setup is required. In **manual mode** (auto-register disabled), enable **Verify Signature** and provide the signing secret in the trigger node. Keep the signing secret confidential; if leaked, rotate it immediately via the Revolut Business node or Revolut dashboard, then deactivate/reactivate the workflow (auto-register) or update the **Signing Secret** field (manual) to resume verification.
> - The trigger verifies signatures using the signed payload `v1.{Revolut-Request-Timestamp}.{rawBody}`. Any proxy or gateway in front of n8n must forward the raw body and both the `Revolut-Signature`/`x-revolut-signature` and `Revolut-Request-Timestamp` headers unmodified — re-encoding or buffering the body, or dropping either header, breaks automatic verification.
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
2. Decide whether to enable **Register Webhook Automatically** (default: on).
3. If enabled, activate the workflow — the node calls `POST /webhooks`, stores the returned webhook ID and Revolut-generated signing secret in workflow static data, and **always verifies** every incoming event signature automatically. The **Verify Signature** toggle and **Signing Secret** field are not used in this mode.
4. If auto-register is **disabled** (manual mode), manage the webhook outside n8n. Enable **Verify Signature** and paste the webhook's signing secret into the **Signing Secret** field to verify incoming requests.

> **Sandbox:** Sandbox and production Revolut webhooks both return signing secrets and emit verifiable signatures. Auto-register mode works identically in both environments — no additional configuration is required for sandbox testing.

Activation/deactivation notes:

- The trigger stores webhook lifecycle metadata (`id`, `url`, `events`) and the auto-registration signing secret in workflow static data (`node`-scoped).
- **Treat workflow exports and static-data backups as sensitive** — the signing secret is included. Restrict access to exported workflow JSON files accordingly.
- Activation reuses an existing remote webhook when one already exists for the same n8n URL, instead of always creating a duplicate.
- Deactivation tolerates a remote `404` and still clears local lifecycle state including the stored signing secret.

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
- The `Revolut-Signature` (or `x-revolut-signature`) and `Revolut-Request-Timestamp` headers must both be forwarded intact.

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

## Signature verification

**Auto-register mode:** Verification is always enabled. The trigger uses the Revolut-generated signing secret stored in workflow static data at activation time and verifies every incoming event automatically — no manual configuration is required.

**Manual mode** (auto-register disabled): Enable **Verify Signature** in the node parameters and paste the webhook signing secret into the **Signing Secret** field.

**Algorithm** (both modes):

- Timestamp header: `Revolut-Request-Timestamp` (UNIX milliseconds)
- Signature header: `Revolut-Signature` (or `x-revolut-signature`)
- Signature value: `v1=<lowercase-hex-HMAC-SHA256>` — multiple values comma-separated
- Signed payload: `v1.{Revolut-Request-Timestamp}.{rawBody}`
- Timestamp tolerance: ±5 minutes

Verification fails closed — if n8n does not expose the raw request body, the trigger returns a clear error rather than attempting to verify a re-serialized JSON body.

If Revolut documents a different header name or encoding for your account or API version, adjust `src/helpers/webhookSignature.ts`.

## Limitations / TODO

- Automatic webhook registration assumes the standard n8n trigger lifecycle for activation/deactivation.
- Signature verification algorithm assumptions (header name, encoding) are based on available docs; adjust `src/helpers/webhookSignature.ts` if Revolut changes the format.
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

**Webhook signature verification fails after rotating the signing secret**

If you rotated the webhook signing secret outside n8n (via the Revolut Business node **Rotate Signing Secret** operation or the Revolut dashboard), the signing secret stored in workflow static data is now stale.

- **Auto-register mode:** Deactivate the workflow, then reactivate it. Reactivation re-registers the webhook and stores the new signing secret automatically.
- **Manual mode:** Open the trigger node, paste the new signing secret into the **Signing Secret** field, and save the workflow.
