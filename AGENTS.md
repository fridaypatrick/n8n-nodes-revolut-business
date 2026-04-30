# AGENTS.md

Project-specific guidance for n8n-nodes-revolut-business.

## Project Purpose

n8n community node for Revolut Business API, sandbox-first development approach.

## Current Implemented Scope

- **OAuth Credential**: Uses private_key_jwt assumptions with jsonwebtoken
- **Webhook Management Node**: Create/get/list/update/delete/rotate signing secret/get failed events
- **Webhook Trigger Node**: Handles incoming Revolut webhooks
- **Local Development**: docker-compose setup for local n8n instance
- **Testing**: Webhook simulation script for development

## Important Caveats

- **Redirect URIs**: Revolut requires exact registered redirect URIs (no wildcards)
- **Webhook Delivery**: localhost acceptable for OAuth sandbox callback but not real webhook delivery
- **Signature Verification**: Currently best-effort, depends on raw request body access
- **OAuth Flow**: Depends on n8n generic OAuth2 preAuthentication behavior for token exchange and refresh

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