# Acme Money for Agents (white-label)

A white-labelled version of an "AI app ↔ your bank" landing page, plus a small web dashboard
that signs in with OAuth and calls the MCP server's tools directly.

Live site: https://oughton.github.io/agents-whitelabel/

## Re-branding

Everything brand-specific sits in [`config.js`](config.js) (name, tag, connector name, company) and the
CSS variables at the top of [`styles.css`](styles.css). Swap [`assets/logo.svg`](assets/logo.svg) and
[`assets/favicon.svg`](assets/favicon.svg) for your own marks.

## How it works

- **Landing page** (`index.html`, `app.js`): "Get started" opens Claude's *Add custom connector* dialog
  prefilled with the MCP server URL (`https://mcp.truelayer.com/mcp`), and shows the Claude Code
  `claude mcp add` command. The chat demo uses fictional data.
- **Dashboard** (`app.html`, `callback.html`, `dashboard.js`): a browser client for the same MCP server:
  - OAuth 2.1 authorization code + PKCE (S256) against `https://mcp.truelayer.com`
  - Public client registered via dynamic client registration (`POST /register`):
    `client_id = c_6ae05eca661544b78b156440f8a52ef8`, redirect URIs
    `http://localhost:8000/callback.html` and `http://127.0.0.1:8000/callback.html`
  - MCP over streamable HTTP: `initialize`, `tools/list`, `tools/call`, with a form generated
    for each tool from its input schema
  - Tokens are kept in `sessionStorage` only

## Running the dashboard

```sh
node serve.mjs        # Node 18+, no dependencies
open http://localhost:8000/app.html
```

Two constraints from the authorization server mean the dashboard runs locally rather than on GitHub Pages:

1. Dynamically registered clients may only use loopback redirect URIs (or allow-listed callbacks).
   `https://oughton.github.io/...` was rejected with `invalid_redirect_uri`.
2. `/token` sends no CORS headers, so `serve.mjs` proxies `POST /oauth/token` to it.

If the Pages callback gets allow-listed (and CORS added to `/token`), add the URL to
`oauth.redirectUris` in `config.js` and point `tokenRequest` in `dashboard.js` at the issuer's
`/token` endpoint.

To register a new client:

```sh
curl -X POST https://mcp.truelayer.com/register -H 'content-type: application/json' -d '{
  "client_name": "My brand for Agents",
  "redirect_uris": ["http://localhost:8000/callback.html"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",
  "scope": "accounts:read accounts:connect"
}'
```
