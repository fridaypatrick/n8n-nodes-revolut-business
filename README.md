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
4. Paste the **API Certificate ID** (kid) from step 3 into the **Key ID** field. This value is sent as the `kid` header in every `private_key_jwt` assertion and must exactly match the certificate registered in Revolut.
5. Paste the full contents of `.revolut/revolut-business-private-key.pem` (or `revolut_private.pem` if you used OpenSSL manually) into the **Private Key** field.
6. Set the **JWT Issuer (iss)** field to the exact issuer value shown in Revolut Business API configuration — typically displayed as *"The issuer ("iss") in your JWT: `<domain>`"*. Copy that value verbatim (no `https://` scheme, no trailing slash) into the field. This value is embedded in every `private_key_jwt` assertion; a mismatch causes `401 Unauthorized` at token exchange.
7. Set **Scopes** to the permissions your workflows need. Scopes are **case-sensitive** and **comma-separated**; valid values include `READ`, `EDIT`, and `PAY`. For webhook management use at minimum:
   - `READ` — list/get webhooks and failed events
   - `EDIT` — create/update/delete webhooks and rotate signing secret

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

For the Docker setup here, n8n derives the OAuth callback URL from `N8N_EDITOR_BASE_URL` or `WEBHOOK_URL`. Without tunnel mode, both default to `http://localhost:5678`, so the callback will be `http://localhost:5678/rest/oauth2-credential/callback`. In tunnel mode the script sets both variables to the public tunnel URL, overriding this default. Confirm the exact callback shown by n8n in the credential form and register that exact value in Revolut.

## Cloudflare Tunnel (local HTTPS for sandbox testing)

Revolut requires an **exact, registered redirect URI** for OAuth and delivers webhooks only to reachable HTTPS endpoints. A Cloudflare Tunnel exposes your local Docker n8n instance over a public HTTPS URL without opening firewall ports.

> **Editor stays local.** The n8n editor UI remains at `http://localhost:5678`. Only the OAuth callback URL and webhook delivery URLs use the public HTTPS URL.

> **How tunnel mode sets the public URL.** The tunnel script passes the public tunnel URL as both `WEBHOOK_URL` and `N8N_EDITOR_BASE_URL` to the n8n container. n8n may use either variable when generating OAuth callback URLs, so both must point to the public URL for Revolut's redirect URI to resolve correctly. This does not affect local editor access — `http://localhost:5678` continues to work as normal.

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

`cloudflared` starts alongside Docker Compose and prints a random `*.trycloudflare.com` URL. Set that URL as `N8N_WEBHOOK_URL` in Revolut's redirect URI settings.

**Limitation:** the URL changes every run. You must re-register the redirect URI in Revolut each time. Not recommended for repeated sandbox testing.

### Named tunnel (stable URL — recommended)

#### One-time cloudflared setup (required before first use)

Before running `npm run dev:tunnel` with `CLOUDFLARE_TUNNEL_NAME`, you must authenticate `cloudflared` and create the tunnel once:

```bash
# 1. Authenticate — opens a browser to authorise your Cloudflare account.
#    Writes the origin certificate (~/.cloudflared/cert.pem) that cloudflared needs.
cloudflared tunnel login

# 2. Create the named tunnel (only once per tunnel name).
cloudflared tunnel create my-n8n-tunnel

# 3. Route a DNS hostname to the tunnel (replace with your actual domain).
cloudflared tunnel route dns my-n8n-tunnel my-n8n-tunnel.example.com
```

See the [Cloudflare Tunnel setup guide](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/) for full details.

#### Configure `~/.cloudflared/config.yml`

After creating the tunnel, add an ingress rule that maps your custom hostname to the local n8n instance. Without this, `cloudflared` has no route and returns **503** for every request.

```yaml
tunnel: my-n8n-tunnel
credentials-file: /Users/<you>/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: my-n8n-tunnel.example.com
    service: http://localhost:5678
  - service: http_status:404
```

Replace `my-n8n-tunnel.example.com` with the hostname you routed in step 3, and `<tunnel-id>` with the UUID printed by `cloudflared tunnel create`.

> **503 / "No ingress rules were defined"?** If `cloudflared` logs `No ingress rules were defined in the config file` or returns 503 for all requests, the `config.yml` is missing or the `ingress` block is absent/incorrect. Add or fix the ingress rule above and restart the tunnel.

> **Origin cert error?** If you see messages like `Cannot determine default origin certificate path`, `No file cert.pem`, `error parsing tunnel ID`, or `Error locating origin cert`, `cloudflared` cannot find its login certificate or tunnel config — this is a `cloudflared` authentication issue, not an n8n error. Run `cloudflared tunnel login` to generate the certificate, then retry.

#### Running the named tunnel

Set two environment variables before running:

```bash
export CLOUDFLARE_TUNNEL_NAME=my-n8n-tunnel   # your pre-created tunnel name
export N8N_WEBHOOK_URL=https://my-n8n-tunnel.example.com  # stable public URL
npm run dev:tunnel
```

The tunnel reuses the same hostname on every run. Register `https://my-n8n-tunnel.example.com/rest/oauth2-credential/callback` once in Revolut and it remains valid across restarts.

#### Using a `.env` file instead of exporting variables

`npm run dev:tunnel` reads a `.env` file in the project root as an alternative to exporting shell variables. Create the file once and it is picked up automatically on every run:

```dotenv
N8N_WEBHOOK_URL=https://my-n8n-tunnel.example.com
CLOUDFLARE_TUNNEL_NAME=my-n8n-tunnel
```

- Shell environment variables take precedence over `.env` values when both are set.
- `.env` is listed in `.gitignore` and must stay local — do not commit it.

### Externally managed tunnel

If `cloudflared` is already running elsewhere (e.g. a persistent service or a separate `docker-compose` profile), set `N8N_WEBHOOK_URL` to your public URL and omit `CLOUDFLARE_TUNNEL_NAME`. The script will not start a new `cloudflared` process.

```bash
export N8N_WEBHOOK_URL=https://my-n8n-tunnel.example.com
# CLOUDFLARE_TUNNEL_NAME is not set — cloudflared is managed externally
docker compose up
# or equivalently:
npm run dev:tunnel
```

n8n uses `N8N_WEBHOOK_URL` to construct its OAuth callback and webhook URLs; the tunnel itself is your responsibility.

> **Redirect URI shows `localhost`?** If the Revolut authorize URL contains `redirect_uri=http://localhost:5678/...`, the tunnel environment variables (`WEBHOOK_URL` / `N8N_EDITOR_BASE_URL`) were not applied to the running container. Stop the container, ensure the tunnel script or `.env` sets both variables to the public URL, and recreate the container (`docker compose down && npm run dev:tunnel`). Do not just restart — environment changes require container recreation.

### Which mode to use

| Scenario | Recommended mode |
|---|---|
| First-time setup / quick test | Quick tunnel |
| Repeated sandbox development | Named tunnel |
| CI or persistent infra | Externally managed tunnel |

> **Revolut redirect URI reminder:** Revolut enforces exact URI matches. Register the full callback path (`/rest/oauth2-credential/callback`) shown by n8n, not just the base URL. With a named tunnel this only needs to be done once per tunnel hostname.

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

## Troubleshooting

**Token exchange returns `401 Unauthorized`**

This almost always means a mismatch between the credential fields and what Revolut has on record. Check:

- The **Private Key** matches the certificate uploaded to Revolut (they must be a pair).
- The **Key ID** (kid) exactly matches the **API Certificate ID** shown in Revolut's API settings after upload.
- The **JWT Issuer (iss)** matches the issuer domain shown in Revolut's API configuration (e.g. `my-n8n-tunnel.example.com`). A wrong, missing, or scheme-prefixed value is a common cause of `401` at token exchange.
- The **Client ID** is correct for the environment (sandbox vs. production).
- The OAuth connection is not stale — if you changed any credential field after the initial connect, **reconnect** the credential (disconnect and click Connect again) so n8n fetches a fresh token using the updated values.

**Revolut rejects scopes / `invalid_scope` error**

Scopes are case-sensitive and comma-separated with no spaces. If Revolut returns a scope error:

1. Inspect the authorize URL that n8n opens — look for the `scope` query parameter.
2. It should read `scope=READ%2CEDIT` (URL-encoded) or `scope=READ,EDIT` (decoded). Any other casing or separator will be rejected.
3. Correct the **Scopes** field in the credential to exactly `READ,EDIT` (or `READ,EDIT,PAY` if payment access is also needed), then **save and reconnect** the credential (disconnect and click Connect again).
4. If the authorize URL still shows the old scope value after reconnecting, n8n may be using a cached credential state. **Create a fresh Revolut Business OAuth2 API credential** from scratch and re-enter all fields — this clears any stale saved scope.
