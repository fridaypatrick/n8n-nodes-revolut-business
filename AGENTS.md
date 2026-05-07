# AGENTS.md

Project-specific guidance for n8n-nodes-revolut-business.

## Project Purpose

n8n community node for Revolut Business API, sandbox-first development approach.

## Current Implemented Scope

- **OAuth Credential**: Custom refresh-token credential using `private_key_jwt` with `jsonwebtoken`; bootstrapped via `npm run revolut:auth` helper script
- **Webhook Management Node**: Create/get/list/update/delete/rotate signing secret/get failed events
- **Webhook Trigger Node**: Handles incoming Revolut webhooks
- **Local Development**: docker-compose setup for local n8n instance
- **Testing**: Webhook simulation script for development

## Important Caveats

- **Redirect URIs**: Revolut requires exact registered redirect URIs (no wildcards)
- **Webhook Delivery**: localhost acceptable for OAuth sandbox callback but not real webhook delivery
- **Signature Verification**: Auto-register mode always verifies incoming signatures using the Revolut-generated signing secret stored in workflow static data at activation time. Manual mode (auto-register disabled) uses the Verify Signature toggle and the Signing Secret field. Verification depends on raw request body access; fails closed if unavailable. Algorithm assumptions (header name, HMAC-SHA256 encoding) are in `src/helpers/webhookSignature.ts`.
- **Auth Flow**: Does **not** use n8n generic OAuth2 Connect/callback. Revolut's `app-confirm` callback lacks `state`, so auth is bootstrapped manually via `npm run revolut:auth`; the resulting refresh token is pasted into the credential. The credential handles token refresh at runtime via `private_key_jwt` assertions without any n8n OAuth Connect button.
- **Public Webhook URL Template**: Production-only trigger field for gateway/reverse-proxy setups where the external URL differs from n8n's generated URL (e.g. gateway rewrites `/hooks/revolut-business/<id>` → `/webhook/<id>/revolut-business`). Must be HTTPS and contain exactly one `{webhookId}` placeholder. Empty = use n8n-generated URL directly. Test trigger always uses native n8n test URL, ignoring this field. The gateway must forward the raw body and Revolut signature headers unmodified.

## Local Validation

Commands that pass validation:
```bash
npm run build
npm run test
npm pack --dry-run
docker compose config
```

## Packaging Notes

- SVG assets copied into dist directory during build
- Tests excluded from package build
- Current feature branch: `feat/revolut-webhooks`

## Development Workflow

1. Use docker-compose for local n8n testing
2. Run simulation script for webhook testing
3. Validate with npm commands before commits
4. Test OAuth flow in sandbox environment first