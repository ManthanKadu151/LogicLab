/* app.js
 * Wires the page together: tabs, gate explorer, expression tool, K-map, circuits, converter.
 * No inline handlers anywhere, so a strict Content-Security-Policy works.
 */
(function () {
  'use strict';
  const LL = window.LL;
  const esc = LL.esc;
  const $ = (id) => document.getElementById(id);

  /* ---------------------------------------------------------------- helpers */

  function highlightRow(container, index) {
    container.querySelectorAll('tr.active').forEach((r) => r.classList.remove('active'));
    const row = container.querySelector('tr[data-i="' + index + '"]');
    if (row) row.classList.add('active');
  }

  function setPressed(group, attr, value) {
    group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(value))));
  }

  function showError(el, html) { el.innerHTML = html; el.hidden = false; }
  function hideError(el) { el.hidden = true; el.innerHTML = ''; }

  function chips(container, items, onPick) {
    container.innerHTML = '';
    items.forEach((it) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = it.label;
      b.addEventListener('click', () => onPick(it));
      container.appendChild(b);
    });
  }

  function bitsCell(bits) { return bits.map((b) => '<td class="b' + b + '">' + b + '</td>').join(''); }

  /** Generic truth table HTML: inputs + any number of output columns. */
  function tableHTML(inputNames, rows, outNames) {
    let h = '<table class="tt"><thead><tr><th class="idx">#</th>' +
      inputNames.map((n) => '<th>' + esc(n) + '</th>').join('') +
      outNames.map((n) => '<th class="out-h">' + esc(n) + '</th>').join('') + '</tr></thead><tbody>';
    rows.forEach((r) => {
      h += '<tr data-i="' + r.index + '"><td class="idx">' + r.index + '</td>' + bitsCell(r.bits) +
        r.outs.map((o) => '<td class="out o' + o + '">' + o + '</td>').join('') + '</tr>';
    });
    return h + '</tbody></table>';
  }

  const mList = (arr) => (arr.length ? arr.join(', ') : 'none');

  function formsHTML(pairs) {
    return pairs.map((p) => '<div class="form-row"><dt>' + p[0] + '</dt><dd><code>' + esc(p[1]) + '</code></dd></div>').join('');
  }

  /* ---------------------------------------------------------------- theme */

  (function initTheme() {
    const root = document.documentElement;
    try {
      const saved = localStorage.getItem('logiclab-theme');
      if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved);
    } catch (e) { /* storage unavailable: fine */ }
    $('theme-toggle').addEventListener('click', () => {
      const current = root.getAttribute('data-theme') ||
        (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('logiclab-theme', next); } catch (e) { /* ignore */ }
    });
  })();

  /* ---------------------------------------------------------------- tabs */

  const TABS = ['gates', 'expr', 'kmap', 'circuits', 'convert'];

  function showTab(id) {
    if (TABS.indexOf(id) === -1) id = 'gates';
    TABS.forEach((t) => {
      const on = t === id;
      $('tab-' + t).hidden = !on;
      const b = $('tabbtn-' + t);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
  }

  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    showTab(b.getAttribute('data-tab'));
    try { history.replaceState(null, '', '#' + b.getAttribute('data-tab')); } catch (err) { /* ignore */ }
  });
  document.querySelector('.tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const cur = TABS.findIndex((t) => $('tabbtn-' + t).getAttribute('aria-selected') === 'true');
    const next = TABS[(cur + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    showTab(next);
    $('tabbtn-' + next).focus();
  });
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));

  /* ---------------------------------------------------------------- gates */

  const GATES = ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR'];
  const gateView = LL.render.createCircuitView($('gate-view'), {
    scale: 1.5,
    label: 'Logic gate with input switches',
    onChange: (info) => highlightRow($('gate-table'), info.index)
  });

  function setGate(type) {
    const ins = type === 'NOT' ? ['A'] : ['A', 'B'];
    const rows = [];
    for (let i = 0; i < (1 << ins.length); i++) {
      const bits = LL.bitsOf(i, ins.length);
      rows.push({ index: i, bits, outs: [LL.evalGate(type, bits)] });
    }
    $('gate-table').innerHTML = tableHTML(ins, rows, ['Y']);
    $('gate-blurb').textContent = LL.GATE_INFO[type].blurb;
    $('gate-expr').textContent = LL.GATE_INFO[type].expr;
    setPressed($('gate-picker'), 'data-gate', type);
    gateView.setNetlist({ inputs: ins, gates: [{ id: 'g1', type, ins }], outputs: [{ name: 'Y', from: 'g1' }] });
  }

  (function initGates() {
    const picker = $('gate-picker');
    GATES.forEach((g) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = g;
      b.setAttribute('data-gate', g);
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => setGate(g));
      picker.appendChild(b);
    });
    setGate('AND');
  })();

  /* ---------------------------------------------------------------- expressions */

  const exprState = { ast: null, vars: [], sopAst: null, mode: 'typed', rows: null, minterms: [] };
  const exprView = LL.render.createCircuitView($('expr-circuit-view'), {
    scale: 1,
    label: 'Circuit for the expression',
    onChange: (info) => highlightRow($('expr-table'), info.index)
  });

  const EXPR_EXAMPLES = [
    { label: "A.B + A'.C", value: "A.B + A'.C" },
    { label: "AB + A'C + BC", value: "AB + A'C + BC" },
    { label: 'A + A.B', value: 'A + A.B' },
    { label: "(A + B)'", value: "(A + B)'" },
    { label: 'A ^ B ^ C', value: 'A ^ B ^ C' },
    { label: "(A + B)(A' + C)", value: "(A + B)(A' + C)" },
    { label: 'A NAND B', value: 'A NAND B' }
  ];

  function parseProblem(err, src, prefix) {
    if (!(err instanceof LL.parser.ParseError)) return esc(err.message || String(err));
    const pos = Math.max(0, Math.min(err.pos || 0, src.length));
    return '<strong>' + esc((prefix || '') + err.message) + '</strong>' +
      '<pre class="caret">' + esc(src) + '\n' + ' '.repeat(pos) + '^</pre>';
  }

  function drawExprCircuit() {
    const msg = $('expr-circuit-msg'), view = $('expr-circuit-view');
    const ast = exprState.mode === 'sop' ? exprState.sopAst : exprState.ast;
    if (ast.type === 'const') {
      view.hidden = true;
      msg.textContent = 'The function is the constant ' + ast.value + ' for every input, so no gates are needed.';
      msg.hidden = false;
      return;
    }
    try {
      const net = LL.netlist.astToNetlist(ast, exprState.vars);
      if (net.gates.length > 40) throw new Error('This circuit has ' + net.gates.length + ' gates, which is too many to draw clearly. Try the simplified form.');
      msg.hidden = true;
      view.hidden = false;
      exprView.setNetlist(net);
    } catch (e) {
      view.hidden = true;
      msg.textContent = e.message;
      msg.hidden = false;
    }
  }

  function evaluateExpression() {
    const src1 = $('expr-input').value;
    const err = $('expr-error'), results = $('expr-results');
    hideError(err);
    let ast;
    try { ast = LL.parser.parse(src1); } catch (e) { results.hidden = true; showError(err, parseProblem(e, src1)); return; }
    const vars = LL.parser.variables(ast);
    if (vars.length === 0) {
      results.hidden = true;
      showError(err, '<strong>The expression has no variables.</strong> Its value is always ' + LL.parser.evaluate(ast, {}) + '.');
      return;
    }
    if (vars.length > 6) {
      results.hidden = true;
      showError(err, '<strong>Too many variables.</strong> LogicLab supports up to 6 (found ' + vars.length + ': ' + esc(vars.join(', ')) + ').');
      return;
    }

    const n = vars.length;
    const rows = LL.parser.truthTable(ast, vars);
    const ones = rows.filter((r) => r.out === 1).map((r) => r.index);
    const zeros = rows.filter((r) => r.out === 0).map((r) => r.index);
    const min = LL.qm.minimise(n, ones, [], vars);

    exprState.ast = ast;
    exprState.vars = vars;
    exprState.sopAst = min.sopAst;
    exprState.minterms = ones;
    exprState.rows = rows;

    $('expr-parsed').innerHTML = 'Read as <code>' + esc(LL.parser.fullString(ast)) + '</code> over ' + n + ' variable' + (n > 1 ? 's' : '') + ' (' + (1 << n) + ' rows).';

    $('expr-table').innerHTML = tableHTML(vars, rows.map((r) => ({ index: r.index, bits: r.bits, outs: [r.out] })), ['F']);

    const fn = 'F(' + vars.join(',') + ')';
    $('expr-forms').innerHTML = formsHTML([
      [fn + ' as minterms', 'Σm(' + mList(ones) + ')'],
      [fn + ' as maxterms', 'ΠM(' + mList(zeros) + ')'],
      ['Canonical SOP', LL.qm.canonicalSOP(ones, n, vars)],
      ['Canonical POS', LL.qm.canonicalPOS(zeros, n, vars)],
      ['Minimised SOP', min.sopText],
      ['Minimised POS', min.posText]
    ]);

    const actions = $('expr-actions');
    actions.innerHTML = '';
    if (n >= 2 && n <= 4) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.textContent = 'Open in K-map';
      b.addEventListener('click', () => {
        kmLoad(n, vars, ones, []);
        showTab('kmap');
        try { history.replaceState(null, '', '#kmap'); } catch (e) { /* ignore */ }
      });
      actions.appendChild(b);
    }

    results.hidden = false;
    drawExprCircuit();
  }

  (function initExpr() {
    chips($('expr-examples'), EXPR_EXAMPLES, (it) => { $('expr-input').value = it.value; evaluateExpression(); });
    $('expr-run').addEventListener('click', evaluateExpression);
    let timer = null;
    $('expr-input').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(evaluateExpression, 250); });
    $('expr-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') evaluateExpression(); });
    $('expr-circuit-mode').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]');
      if (!b || !exprState.ast) return;
      exprState.mode = b.getAttribute('data-mode');
      setPressed($('expr-circuit-mode'), 'data-mode', exprState.mode);
      drawExprCircuit();
    });
    evaluateExpression();
  })();

  /* ---------------------------------------------------------------- K-map */

  const km = { n: 4, names: ['A', 'B', 'C', 'D'], cells: new Array(16).fill(0), mode: 'sop' };

  const KMAP_EXAMPLES = [
    { label: 'Σm(0,1,2,5,8,9,10)', n: 4, ones: [0, 1, 2, 5, 8, 9, 10], dcs: [] },
    { label: 'Σm(4,8,10,11,12,15) + d(9,14)', n: 4, ones: [4, 8, 10, 11, 12, 15], dcs: [9, 14] },
    { label: 'Σm(1,3,5,6,7)', n: 3, ones: [1, 3, 5, 6, 7], dcs: [] },
    { label: 'Σm(0,1,2,5,6,7)', n: 3, ones: [0, 1, 2, 5, 6, 7], dcs: [] },
    { label: 'XOR: Σm(1,2)', n: 2, ones: [1, 2], dcs: [] }
  ];

  function kmLoad(n, names, ones, dcs) {
    km.n = n;
    km.names = names.slice();
    km.cells = new Array(1 << n).fill(0);
    ones.forEach((m) => { km.cells[m] = 1; });
    dcs.forEach((m) => { km.cells[m] = 2; });
    hideError($('kmap-error'));
    kmSyncFields();
    kmRender();
  }

  function kmSyncFields() {
    const ones = [], dcs = [];
    km.cells.forEach((v, m) => { if (v === 1) ones.push(m); else if (v === 2) dcs.push(m); });
    $('kmap-minterms').value = ones.join(', ');
    $('kmap-dcs').value = dcs.join(', ');
  }

  function parseList(text, max, label) {
    const out = [];
    const parts = text.split(/[\s,;]+/).filter(Boolean);
    for (const p of parts) {
      if (!/^\d+$/.test(p) || Number(p) >= max) throw new Error("'" + p + "' is not a valid " + label + '. Use whole numbers from 0 to ' + (max - 1) + '.');
      out.push(Number(p));
    }
    return out;
  }

  function kmFromFields() {
    const err = $('kmap-error');
    try {
      const size = 1 << km.n;
      const ones = parseList($('kmap-minterms').value, size, 'minterm');
      const dcs = parseList($('kmap-dcs').value, size, "don't care");
      const clash = ones.find((m) => dcs.indexOf(m) !== -1);
      if (clash !== undefined) throw new Error('m' + clash + " is listed as both a minterm and a don't care.");
      hideError(err);
      km.cells = new Array(size).fill(0);
      ones.forEach((m) => { km.cells[m] = 1; });
      dcs.forEach((m) => { km.cells[m] = 2; });
      kmRender();
    } catch (e) {
      showError(err, '<strong>' + esc(e.message) + '</strong>');
    }
  }

  function kmRender() {
    const n = km.n, names = km.names;
    const ones = [], dcs = [];
    km.cells.forEach((v, m) => { if (v === 1) ones.push(m); else if (v === 2) dcs.push(m); });
    const min = LL.qm.minimise(n, ones, dcs, names);
    const res = km.mode === 'sop' ? min.sop : min.pos;
    const groups = res.primes.filter((p) => p.inSolution).map((p) => ({ bits: p.bits, covers: p.covers }));

    $('kmap-view').innerHTML = LL.render.kmapSVG({ n, names, cells: km.cells, groups });
    setPressed($('kmap-n'), 'data-n', n);
    setPressed($('kmap-mode'), 'data-mode', km.mode);

    const label = (bits) => (km.mode === 'pos' ? '(' + LL.qm.termPOS(bits, names) + ')' : LL.qm.termSOP(bits, names));
    $('kmap-legend').innerHTML = groups.map((g, i) =>
      '<li><span class="sw gc' + (i % 6) + '"></span><code>' + esc(label(g.bits)) + '</code><span class="muted">cells ' + g.covers.join(', ') + '</span></li>'
    ).join('');

    $('kmap-result').innerHTML = formsHTML([
      ['F(' + names.join(',') + ')', 'Σm(' + mList(ones) + ')' + (dcs.length ? ' + d(' + dcs.join(', ') + ')' : '')],
      ['Minimised SOP', min.sopText],
      ['Minimised POS', min.posText]
    ]);
  }

  (function initKmap() {
    chips($('kmap-examples'), KMAP_EXAMPLES, (it) => kmLoad(it.n, ['A', 'B', 'C', 'D'].slice(0, it.n), it.ones, it.dcs));

    $('kmap-n').addEventListener('click', (e) => {
      const b = e.target.closest('[data-n]');
      if (!b) return;
      const n = Number(b.getAttribute('data-n'));
      const size = 1 << n;
      const keep = km.cells.slice(0, size);
      km.n = n;
      km.names = ['A', 'B', 'C', 'D'].slice(0, n);
      km.cells = keep.concat(new Array(size - keep.length).fill(0));
      hideError($('kmap-error'));
      kmSyncFields();
      kmRender();
    });

    $('kmap-mode').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]');
      if (!b) return;
      km.mode = b.getAttribute('data-mode');
      kmRender();
    });

    const cycle = (el) => {
      const m = Number(el.getAttribute('data-m'));
      km.cells[m] = (km.cells[m] + 1) % 3;
      hideError($('kmap-error'));
      kmSyncFields();
      kmRender();
      const again = Array.from($('kmap-view').querySelectorAll('[data-m]')).find((x) => Number(x.getAttribute('data-m')) === m);
      if (again) again.focus();
    };
    $('kmap-view').addEventListener('click', (e) => {
      const el = e.target.closest('[data-m]');
      if (el) cycle(el);
    });
    $('kmap-view').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target.closest('[data-m]');
      if (el) { e.preventDefault(); cycle(el); }
    });

    $('kmap-minterms').addEventListener('input', kmFromFields);
    $('kmap-dcs').addEventListener('input', kmFromFields);

    const first = KMAP_EXAMPLES[0];
    kmLoad(first.n, ['A', 'B', 'C', 'D'], first.ones, first.dcs);
  })();

  /* ---------------------------------------------------------------- standard circuits */

  const circuitView = LL.render.createCircuitView($('circuit-view'), {
    scale: 1,
    label: 'Standard combinational circuit',
    onChange: (info) => highlightRow($('circuit-table'), info.index)
  });

  function setCircuit(id) {
    const c = LL.CIRCUITS.find((x) => x.id === id) || LL.CIRCUITS[0];
    setPressed($('circuit-picker'), 'data-circuit', c.id);
    $('circuit-blurb').textContent = c.blurb;
    $('circuit-eqs').innerHTML = c.equations.map((q) => '<li><code>' + esc(q) + '</code></li>').join('');

    const names = c.net.outputs.map((o) => o.name);
    if (c.net.inputs.length <= 4) {
      const rows = LL.netlist.netlistTable(c.net).map((r) => ({ index: r.index, bits: r.bits, outs: names.map((nm) => r.outputs[nm]) }));
      $('circuit-table').innerHTML = tableHTML(c.net.inputs, rows, names);
    } else {
      $('circuit-table').innerHTML = '<p class="hint">This circuit has ' + c.net.inputs.length + ' inputs (' + (1 << c.net.inputs.length) +
        ' rows), which is too long to list. Use the equation above and try the switches: the output follows the input chosen by S1 S0.</p>';
    }
    circuitView.setNetlist(c.net);
  }

  (function initCircuits() {
    const picker = $('circuit-picker');
    LL.CIRCUITS.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = c.name;
      b.setAttribute('data-circuit', c.id);
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => setCircuit(c.id));
      picker.appendChild(b);
    });
    setCircuit(LL.CIRCUITS[0].id);
  })();

  /* ---------------------------------------------------------------- number systems */

  function convert() {
    const err = $('conv-error'), card = $('conv-card');
    hideError(err);
    const base = Number($('conv-base').value);
    const raw = $('conv-input').value.replace(/[\s_]/g, '').toUpperCase();
    if (!raw) { card.hidden = true; showError(err, '<strong>Enter a number to convert.</strong>'); return; }
    if (raw.length > 64) { card.hidden = true; showError(err, '<strong>That number is too long.</strong> Use at most 64 digits.'); return; }
    const digits = '0123456789ABCDEF';
    let value = BigInt(0);
    for (const ch of raw) {
      const d = digits.indexOf(ch);
      if (d < 0 || d >= base) {
        card.hidden = true;
        showError(err, "<strong>'" + esc(ch) + "' is not a valid base-" + base + ' digit.</strong>');
        return;
      }
      value = value * BigInt(base) + BigInt(d);
    }
    const bin = value.toString(2);
    const grouped = bin.padStart(Math.ceil(bin.length / 4) * 4, '0').replace(/(.{4})(?=.)/g, '$1 ');
    $('conv-result').innerHTML = formsHTML([
      ['Binary', grouped],
      ['Octal', value.toString(8)],
      ['Decimal', value.toString(10)],
      ['Hexadecimal', value.toString(16).toUpperCase()]
    ]);
    card.hidden = false;
  }

  (function initConvert() {
    $('conv-input').addEventListener('input', convert);
    $('conv-base').addEventListener('change', convert);
    convert();
  })();

  /* ---------------------------------------------------------------- start */
  showTab(location.hash.slice(1));
})();
