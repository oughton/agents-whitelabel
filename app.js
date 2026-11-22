// Landing page behaviour: white-label branding, "Get started" (Add to Claude) links,
// the Claude Code command, and the animated example chat. No dependencies.
(() => {
  const cfg = window.SITE;
  if (!cfg) return;

  // ---------- branding ----------
  const setText = (sel, v) => v && document.querySelectorAll(sel).forEach((e) => { e.textContent = v; });
  setText('[data-brand]', cfg.brandName);
  setText('[data-brand-tag]', cfg.brandTag);
  setText('[data-connector]', cfg.connectorName);
  setText('[data-company]', cfg.company);
  setText('#year', String(new Date().getFullYear()));
  document.title = `${cfg.brandName} ${cfg.brandTag} · Ask your AI app about your money`;

  // ---------- "Get started": opens Claude's "Add custom connector" dialog, prefilled ----------
  const addUrl = 'https://claude.ai/customize/connectors?modal=add-custom-connector'
    + `&connectorName=${encodeURIComponent(cfg.connectorName)}&connectorUrl=${encodeURIComponent(cfg.mcpUrl)}`;
  document.querySelectorAll('[data-add]').forEach((a) => { a.href = addUrl; a.target = '_blank'; a.rel = 'noopener'; });
  const adminUrl = addUrl.replace('/customize/connectors?', '/admin-settings/connectors?');
  document.querySelectorAll('[data-add-admin]').forEach((a) => { a.href = adminUrl; a.target = '_blank'; a.rel = 'noopener'; });

  // ---------- Claude Code command ----------
  const cmd = `claude mcp add --transport http ${cfg.mcpSlug} ${cfg.mcpUrl}`;
  const cmdEl = document.getElementById('cc-cmd');
  if (cmdEl) cmdEl.textContent = cmd;
  const copyBtn = document.getElementById('copy-cmd');
  copyBtn?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(cmd); copyBtn.textContent = 'Copied ✓'; } catch { copyBtn.textContent = 'Select & copy'; }
    setTimeout(() => (copyBtn.textContent = 'Copy'), 1800);
  });

  // ---------- animated chat ----------
  const body = document.getElementById('chat-body');
  const typing = document.getElementById('chat-typing');
  const toggle = document.getElementById('chat-toggle');
  const replay = document.getElementById('chat-replay');
  if (!body || !typing) return;

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let paused = false, run = 0;
  const sleep = async (ms, id) => {
    const end = Date.now() + ms;
    while (Date.now() < end || paused) { if (id !== run) throw new Error('stop'); await new Promise((r) => setTimeout(r, 50)); }
    if (id !== run) throw new Error('stop');
  };
  // keep the newest messages visible: drop the oldest when the window is full
  const fit = () => { while (body.scrollHeight > body.clientHeight && body.children.length > 1) body.removeChild(body.firstChild); };
  const add = (node) => { body.appendChild(node); fit(); return node; };

  // --- answers (sample data) ---
  function spending() {
    const box = el('div', 'answer');
    const p = el('p'); p.append('You spent ', el('b', '', '£1,842'), ' in October across Monzo and Revolut. Groceries and bills were the biggest:');
    const chart = el('div', 'chart');
    const rows = [['Bills', 526, 'c1'], ['Groceries', 412, 'c2'], ['Shopping', 350, 'c3'], ['Eating out', 268, 'c4'], ['Transport', 190, 'c5'], ['Subscriptions', 96, 'c6']];
    const fills = rows.map(([label, v, c]) => {
      const r = el('div', 'bar-row'); const t = el('div', 'track'); const f = el('div', `fill ${c}`); t.appendChild(f);
      r.append(el('span', 'lbl', label), t, el('span', 'val', `£${v}`)); chart.appendChild(r); return [f, v];
    });
    box.append(p, chart);
    return { node: box, after: () => fills.forEach(([f, v], i) => setTimeout(() => f.style.setProperty('width', `${Math.round((v / 526) * 100)}%`), 80 * i)) };
  }
  function subscriptions() {
    const box = el('div', 'answer');
    const p = el('p'); p.append('I found ', el('b', '', '4 subscriptions'), ', ', el('b', '', '£61.97 a month'), ':');
    const list = el('div', 'subs');
    [['N', 'Netflix', '£10.99', 'c3'], ['S', 'Spotify', '£11.99', 'c5'], ['G', 'PureGym', '£35.00', 'c1'], ['i', 'iCloud+', '£2.99', 'c2']].forEach(([l, name, amt, c], i) => {
      const row = el('div', 'sub-row msg'); row.style.setProperty('animation-delay', `${i * 120}ms`);
      const left = el('span'); left.append(el('span', `logo ${c}`, l), name);
      row.append(left, el('span', '', amt)); list.appendChild(row);
    });
    const tip = el('p'); tip.style.setProperty('margin-top', '8px'); tip.textContent = 'PureGym is the largest. You haven\'t been charged by anything else recurring this quarter.';
    box.append(p, list, tip);
    return { node: box };
  }
  function balances() {
    const box = el('div', 'answer');
    const p = el('p'); p.append('You have ', el('b', '', '£1,236.00'), ' across 2 current accounts:');
    const cards = el('div', 'cards');
    const spark = (pts) => {
      const ns = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 100 28'); svg.setAttribute('preserveAspectRatio', 'none');
      const path = document.createElementNS(ns, 'path'); path.setAttribute('d', pts.map((y, i) => `${i ? 'L' : 'M'}${(i / (pts.length - 1)) * 100},${28 - y}`).join(' '));
      path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#0f766e'); path.setAttribute('stroke-width', '2'); path.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.appendChild(path); return svg;
    };
    [['Monzo · Current', '£836.40', [10, 14, 12, 18, 16, 22, 20]], ['Revolut · Current', '£399.60', [20, 16, 18, 12, 14, 10, 12]]].forEach(([n, v, pts]) => {
      const c = el('div', 'bal'); c.append(el('small', '', n), el('strong', '', v), spark(pts)); cards.appendChild(c);
    });
    box.append(p, cards, el('span', 'verdict', 'Monzo holds about two thirds of it'));
    return { node: box };
  }

  const script = [
    { q: 'How much did I spend last month?', tool: ['summarise_spending', 'Oct 1 – Oct 31 · 2 banks'], answer: spending },
    { q: 'Which subscriptions am I paying for?', tool: ['get_transactions', 'recurring payments'], answer: subscriptions },
    { q: 'How much do I have across all my accounts?', tool: ['get_balances', 'Monzo · Revolut'], answer: balances },
  ];

  async function play(id) {
    body.textContent = ''; typing.textContent = '';
    for (;;) {
      for (const step of script) {
        // one question at a time: fade the previous exchange out, then start clean
        if (body.children.length) { body.classList.add('fade'); await sleep(450, id); body.textContent = ''; body.classList.remove('fade'); }
        await sleep(500, id);
        for (const ch of step.q) { typing.textContent += ch; await sleep(38 + Math.random() * 40, id); }
        await sleep(350, id);
        typing.textContent = '';
        add(el('div', 'msg user', step.q));
        await sleep(500, id);
        const claude = add(el('div', 'msg claude'));
        const chip = el('div', 'tool'); chip.append(el('span', 'spin'), el('b', '', step.tool[0]), el('span', '', `· ${step.tool[1]}`));
        claude.appendChild(chip); fit();
        await sleep(1100, id);
        chip.firstChild.replaceWith(el('span', 'ok', '✓'));
        const a = step.answer(); claude.appendChild(a.node); fit();
        requestAnimationFrame(() => a.after?.());
        await sleep(3800, id);
      }
      await sleep(800, id);
    }
  }
  // Reduced motion: show one finished exchange, no animation loop.
  function still() {
    const step = script[0];
    body.textContent = '';
    add(el('div', 'msg user', step.q));
    const claude = add(el('div', 'msg claude'));
    const chip = el('div', 'tool'); chip.append(el('span', 'ok', '✓'), el('b', '', step.tool[0]), el('span', '', `· ${step.tool[1]}`));
    const a = step.answer(); claude.append(chip, a.node); a.after?.(); fit();
    toggle?.remove(); replay?.remove();
  }
  if (reduced) { still(); return; }
  const start = () => { run++; paused = false; if (toggle) toggle.textContent = '❚❚ Pause'; play(run).catch(() => {}); };
  toggle?.addEventListener('click', () => { paused = !paused; toggle.textContent = paused ? '▶ Play' : '❚❚ Pause'; });
  replay?.addEventListener('click', start);
  start();
})();
