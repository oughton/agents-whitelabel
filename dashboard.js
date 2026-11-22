// Web dashboard: OAuth 2.1 authorization code + PKCE against the MCP server's authorization server,
// then a minimal MCP (streamable HTTP, JSON-RPC) client that lists and runs the server's tools.
// Used by app.html (dashboard) and callback.html (OAuth redirect target).
(() => {
  const cfg = window.SITE;
  const o = cfg.oauth;
  const $ = (id) => document.getElementById(id);
  const status = (msg) => { const s = $('status'); if (s) s.textContent = msg || ''; };
  document.querySelectorAll('[data-brand]').forEach((e) => { e.textContent = cfg.brandName; });
  document.title = `${cfg.brandName} · ${document.title}`;

  // Tokens live in sessionStorage only: gone when the tab closes.
  const store = {
    get: () => { try { return JSON.parse(sessionStorage.getItem('tokens')); } catch { return null; } },
    set: (t) => sessionStorage.setItem('tokens', JSON.stringify(t)),
    clear: () => sessionStorage.removeItem('tokens'),
  };

  const redirectUri = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}callback.html`;
  const redirectAllowed = o.redirectUris.includes(redirectUri);

  // ---------- PKCE helpers ----------
  const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const randomString = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
  const sha256 = (s) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));

  async function signIn() {
    const verifier = randomString(48);
    const state = randomString(16);
    sessionStorage.setItem('pkce', JSON.stringify({ verifier, state }));
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: o.clientId,
      redirect_uri: redirectUri,
      scope: o.scope,
      state,
      code_challenge: b64url(await sha256(verifier)),
      code_challenge_method: 'S256',
      resource: cfg.mcpUrl,
    });
    location.assign(`${o.issuer}/authorize?${q}`);
  }

  // The token endpoint has no CORS headers, so exchanges go through serve.mjs's /oauth/token proxy.
  async function tokenRequest(params) {
    const res = await fetch('oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: o.clientId, resource: cfg.mcpUrl, ...params }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error_description || body.error || `token endpoint returned ${res.status}`);
    return { ...body, expires_at: Date.now() + (body.expires_in || 3600) * 1000 };
  }

  async function handleCallback() {
    const p = new URLSearchParams(location.search);
    const saved = JSON.parse(sessionStorage.getItem('pkce') || 'null');
    sessionStorage.removeItem('pkce');
    if (p.get('error')) throw new Error(`${p.get('error')}: ${p.get('error_description') || ''}`);
    if (!saved || p.get('state') !== saved.state) throw new Error('State mismatch. Start the sign-in again.');
    if (p.get('iss') && p.get('iss') !== o.issuer) throw new Error('Unexpected issuer in the authorization response.');
    const t = await tokenRequest({ grant_type: 'authorization_code', code: p.get('code'), redirect_uri: redirectUri, code_verifier: saved.verifier });
    store.set(t);
    location.replace('app.html');
  }

  async function refresh() {
    const t = store.get();
    if (!t?.refresh_token) throw new Error('Session expired. Sign in again.');
    const n = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
    store.set({ ...t, ...n });
    return n.access_token;
  }

  // ---------- MCP over streamable HTTP ----------
  let rpcId = 0;
  async function rpc(method, params, retried = false) {
    let t = store.get();
    if (!t) throw new Error('Not signed in.');
    if (t.expires_at && Date.now() > t.expires_at - 30000) { await refresh(); t = store.get(); }
    const res = await fetch(cfg.mcpUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${t.access_token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    });
    if (res.status === 401 && !retried) { await refresh(); return rpc(method, params, true); }
    const text = await res.text();
    if (!res.ok) throw new Error(`MCP ${method} failed (${res.status}): ${text.slice(0, 300)}`);
    // Response is either plain JSON or an SSE stream; take the JSON-RPC message that answers our id.
    const messages = (res.headers.get('content-type') || '').includes('text/event-stream')
      ? text.split(/\r?\n\r?\n/).map((ev) => ev.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n')).filter(Boolean).map((d) => JSON.parse(d))
      : [JSON.parse(text)];
    const msg = messages.find((m) => m.id === rpcId) || messages.at(-1);
    if (msg?.error) throw new Error(msg.error.message || JSON.stringify(msg.error));
    return msg?.result;
  }

  // ---------- UI ----------
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

  // Render text with URLs as links (e.g. a "connect your bank" link returned by a tool).
  function linkify(text) {
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of text.matchAll(/https:\/\/[^\s"'<>)\]]+/g)) {
      frag.append(text.slice(last, m.index), el('a', { href: m[0], target: '_blank', rel: 'noopener', textContent: m[0] }));
      last = m.index + m[0].length;
    }
    frag.append(text.slice(last));
    return frag;
  }

  function renderResult(out, result) {
    out.textContent = '';
    out.classList.toggle('err', !!result?.isError);
    const parts = (result?.content || []).map((c) => {
      if (c.type !== 'text') return `[${c.type}]`;
      try { return JSON.stringify(JSON.parse(c.text), null, 2); } catch { return c.text; }
    });
    if (result?.structuredContent && !parts.length) parts.push(JSON.stringify(result.structuredContent, null, 2));
    out.append(linkify(parts.join('\n\n') || '(empty result)'));
  }

  function toolCard(tool) {
    const props = tool.inputSchema?.properties || {};
    const required = new Set(tool.inputSchema?.required || []);
    const inputs = Object.entries(props).map(([name, s]) => {
      const input = s.enum
        ? el('select', { name }, ...(!required.has(name) ? [el('option', { value: '', textContent: '—' })] : []), ...s.enum.map((v) => el('option', { value: v, textContent: v })))
        : el('input', { name, type: s.type === 'number' || s.type === 'integer' ? 'number' : s.type === 'boolean' ? 'checkbox' : (s.format === 'date' ? 'date' : 'text'), placeholder: s.description || '', required: required.has(name) });
      return { name, s, input, label: el('label', {}, `${name}${required.has(name) ? ' *' : ''}`, input) };
    });
    const out = el('div', { className: 'out', hidden: true });
    const run = el('button', { type: 'submit', className: 'btn run', textContent: 'Run' });
    const form = el('form', { className: 'tool' },
      el('h3', { textContent: tool.title || tool.name }),
      el('p', { className: 'desc', textContent: tool.description || '' }),
      ...inputs.map((i) => i.label), run, out);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const args = {};
      for (const { name, s, input } of inputs) {
        if (s.type === 'boolean') { if (input.checked) args[name] = true; continue; }
        if (input.value === '') continue;
        args[name] = s.type === 'number' || s.type === 'integer' ? Number(input.value) : s.type === 'array' ? input.value.split(',').map((v) => v.trim()) : input.value;
      }
      run.disabled = true; run.textContent = 'Running…'; out.hidden = false; out.textContent = '…';
      try { renderResult(out, await rpc('tools/call', { name: tool.name, arguments: args })); }
      catch (err) { out.classList.add('err'); out.textContent = String(err.message || err); }
      finally { run.disabled = false; run.textContent = 'Run'; }
    });
    return form;
  }

  async function showDashboard() {
    $('signin').hidden = true;
    $('signout').hidden = false;
    status('Connecting to the MCP server…');
    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: cfg.connectorName, version: '1.0.0' } });
    $('server-info').textContent = init?.serverInfo ? `${init.serverInfo.name} ${init.serverInfo.version || ''}` : '';
    const { tools = [] } = await rpc('tools/list', {});
    $('tool-list').replaceChildren(...tools.map(toolCard));
    $('tools').hidden = false;
    status(tools.length ? '' : 'The server returned no tools.');
  }

  function showNotice() {
    const n = $('notice');
    n.hidden = false;
    n.append(
      el('p', { className: 'kicker dark', textContent: 'Web dashboard' }),
      el('h1', { textContent: 'Run the dashboard locally' }),
      el('p', { textContent: 'The authorization server only accepts loopback redirect URIs for self-registered clients, so sign-in can\'t complete from this host. Clone the repo and run:' }),
      el('pre', { textContent: 'node serve.mjs\n# then open http://localhost:8000/app.html' }),
      el('p', {}, 'Meanwhile, the hosted connector works in Claude: ', el('a', { href: './#how', textContent: 'add it from the home page' }), '.'),
    );
  }

  async function main() {
    if (location.pathname.endsWith('callback.html')) return handleCallback();
    $('signout').addEventListener('click', async () => {
      const t = store.get();
      store.clear();
      // Best effort revocation (RFC 7009); ignore failures (no CORS on the response).
      if (t?.refresh_token) fetch(`${o.issuer}/revoke`, { method: 'POST', mode: 'no-cors', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: t.refresh_token, token_type_hint: 'refresh_token', client_id: o.clientId }) }).catch(() => {});
      location.reload();
    });
    if (!redirectAllowed) return showNotice();
    if (store.get()) return showDashboard();
    $('signin').hidden = false;
    $('signin-btn').addEventListener('click', () => signIn().catch((e) => status(e.message)));
  }

  main().catch((e) => {
    status(`Error: ${e.message || e}`);
    if (/sign in again|Not signed in/i.test(e.message)) { store.clear(); }
  });
})();
