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
- **Signature Verification**: Currently best-effort, depends on raw request body access
- **Auth Flow**: Does **not** use n8n generic OAuth2 Connect/callback. Revolut's `app-confirm` callback lacks `state`, so auth is bootstrapped manually via `npm run revolut:auth`; the resulting refresh token is pasted into the credential. The credential handles token refresh at runtime via `private_key_jwt` assertions without any n8n OAuth Connect button.

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