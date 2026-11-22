// White-label settings. Change these to re-brand the whole site.
window.SITE = {
  brandName: 'Acme Money',          // shown in the nav, page title, copy and footer
  brandTag: 'for Agents',           // pill next to the logo
  connectorName: 'Acme Money for Agents', // name prefilled in Claude's "Add custom connector" dialog
  company: 'Acme Ltd',              // footer copyright holder
  mcpSlug: 'acme-money',            // name used in the Claude Code command

  // Backend: TrueLayer's MCP server (OAuth 2.1 + PKCE, dynamic client registration).
  mcpUrl: 'https://mcp.truelayer.com/mcp',
  oauth: {
    issuer: 'https://mcp.truelayer.com',
    // Registered via POST https://mcp.truelayer.com/register (public client, no secret).
    clientId: 'c_6ae05eca661544b78b156440f8a52ef8',
    // The server only accepts loopback or allow-listed redirect URIs, so the
    // in-browser dashboard (app.html) works when served from http://localhost:8000.
    redirectUris: ['http://localhost:8000/callback.html', 'http://127.0.0.1:8000/callback.html'],
    scope: 'accounts:read accounts:connect',
  },
};
