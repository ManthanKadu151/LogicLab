/* render.js
 * SVG drawing: logic-gate symbols, live circuit diagrams, and the Karnaugh map.
 * Nothing here uses inline scripts or inline styles, so it works under a strict
 * Content-Security-Policy. All styling comes from css/style.css classes.
 */
(function (root) {
  'use strict';
  const LL = (root.LL = root.LL || {});
  const esc = LL.esc;

  /* ===================== gate symbols ===================== */

  const BR = 4.5;                 // radius of the inversion bubble
  const GATE_W = 64;              // total gate width including the bubble
  const IN_X = 8, IN_W = 62, IN_H = 28;
  const GATE_X0 = 150, COL_W = 150;
  const NEG = { NOT: 1, NAND: 1, NOR: 1, XNOR: 1 };
  const BASE = { AND: 'AND', NAND: 'AND', OR: 'OR', NOR: 'OR', XOR: 'XOR', XNOR: 'XOR', NOT: 'NOT' };

  const gateHeight = (type, n) => (type === 'NOT' ? 34 : Math.max(46, 16 * (n + 1)));

  function orPath(x0, b, h) {
    return 'M' + x0 + ',0 Q' + (x0 + b * 0.5) + ',0 ' + (x0 + b) + ',' + h / 2 +
      ' Q' + (x0 + b * 0.5) + ',' + h + ' ' + x0 + ',' + h +
      ' Q' + (x0 + b * 0.28) + ',' + h / 2 + ' ' + x0 + ',0 Z';
  }

  /** Returns SVG for the body, label and a `lead(y)` function giving where an input wire should stop. */
  function gateShape(type, h) {
    const base = BASE[type], neg = !!NEG[type];
    const bw = neg ? GATE_W - 2 * BR : GATE_W;
    let body = '', lead = () => 0, cx = bw * 0.45;
    if (base === 'AND') {
      body = '<path class="gate-body" d="M0,0 H' + bw / 2 + ' A' + bw / 2 + ',' + h / 2 + ' 0 0 1 ' + bw / 2 + ',' + h + ' H0 Z"/>';
    } else if (base === 'OR') {
      const c = 0.28 * bw;
      body = '<path class="gate-body" d="' + orPath(0, bw, h) + '"/>';
      lead = (y) => 2 * (y / h) * (1 - y / h) * c;
    } else if (base === 'XOR') {
      const b = bw - 6, c = 0.28 * b;
      body = '<path class="gate-body" d="' + orPath(6, b, h) + '"/>' +
        '<path class="gate-extra" d="M0,0 Q' + c + ',' + h / 2 + ' 0,' + h + '"/>';
      lead = (y) => 2 * (y / h) * (1 - y / h) * c;
      cx = 6 + b * 0.45;
    } else {
      body = '<path class="gate-body" d="M0,0 L' + bw + ',' + h / 2 + ' L0,' + h + ' Z"/>';
    }
    if (neg) body += '<circle class="gate-body" cx="' + (bw + BR) + '" cy="' + h / 2 + '" r="' + BR + '"/>';
    const label = base === 'NOT' ? '' : '<text class="gate-label" x="' + cx + '" y="' + h / 2 + '">' + type + '</text>';
    return { body, label, lead };
  }

  /* ===================== circuit layout + drawing ===================== */

  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;

  function layout(net) {
    const pos = {}, geom = {}, lv = {};
    net.inputs.forEach((n, i) => { lv[n] = 0; pos[n] = { x: IN_X + IN_W, y: 30 + i * 52 }; });
    net.gates.forEach((g) => { lv[g.id] = 1 + Math.max.apply(null, g.ins.map((s) => lv[s])); });
    const maxL = net.gates.reduce((m, g) => Math.max(m, lv[g.id]), 0);
    // Push each gate as far right as it can go, so gates sit next to the gate they feed
    // instead of far from it with a long wire crossing other columns.
    const consumers = {};
    net.gates.forEach((g) => g.ins.forEach((s) => { (consumers[s] = consumers[s] || []).push(g.id); }));
    for (let i = net.gates.length - 1; i >= 0; i--) {
      const g = net.gates[i], cs = consumers[g.id];
      lv[g.id] = cs && cs.length ? Math.min.apply(null, cs.map((c) => lv[c])) - 1 : maxL;
    }
    let bottomMost = 30 + (net.inputs.length - 1) * 52 + IN_H / 2;

    for (let L = 1; L <= maxL; L++) {
      const items = net.gates.filter((g) => lv[g.id] === L).map((g) => ({
        g, h: gateHeight(g.type, g.ins.length), want: avg(g.ins.map((s) => pos[s].y))
      }));
      items.sort((a, b) => a.want - b.want);
      let bottom = -14;
      items.forEach((it) => {
        const top = Math.max(it.want - it.h / 2, bottom + 22, 8);
        bottom = top + it.h;
        const x = GATE_X0 + (L - 1) * COL_W;
        geom[it.g.id] = { x, y: top, h: it.h };
        pos[it.g.id] = { x: x + GATE_W, y: top + it.h / 2 };
        bottomMost = Math.max(bottomMost, bottom);
      });
    }

    const outX = (maxL > 0 ? GATE_X0 + (maxL - 1) * COL_W + GATE_W : IN_X + IN_W) + 70;
    const outs = [];
    let lastY = -Infinity;
    net.outputs.map((o) => ({ o, want: pos[o.from].y })).sort((a, b) => a.want - b.want).forEach((it) => {
      const y = Math.max(it.want, lastY + 34, 20);
      lastY = y;
      outs.push({ name: it.o.name, from: it.o.from, y });
      bottomMost = Math.max(bottomMost, y + 14);
    });
    const longest = net.outputs.reduce((m, o) => Math.max(m, o.name.length), 1);
    return { pos, geom, outs, outX, width: outX + 36 + longest * 8 + 12, height: bottomMost + 16 };
  }

  function wirePath(x1, y1, x2, y2, k) {
    if (y1 === y2) return 'M' + x1 + ',' + y1 + ' H' + x2;
    const xv = x2 - 14 - (k % 3) * 5;
    return 'M' + x1 + ',' + y1 + ' H' + xv + ' V' + y2 + ' H' + x2;
  }

  function renderSVG(net, inputs, evalRes, opts) {
    const L = layout(net);
    const vals = evalRes.values;
    const lo = [], hi = [];
    const addWire = (x1, y1, x2, y2, k, v) => {
      const p = '<path class="wire' + (v ? ' hi' : '') + '" d="' + wirePath(x1, y1, x2, y2, k) + '"/>';
      (v ? hi : lo).push(p);
    };

    let gatesSVG = '';
    net.gates.forEach((g) => {
      const G = L.geom[g.id], n = g.ins.length;
      const shape = gateShape(g.type, G.h);
      let leads = '';
      g.ins.forEach((src, i) => {
        const ly = (G.h * (i + 1)) / (n + 1);
        addWire(L.pos[src].x, L.pos[src].y, G.x, G.y + ly, i, vals[src]);
        const lx = shape.lead(ly);
        if (lx > 0.5) leads += '<line class="lead" x1="0" y1="' + ly + '" x2="' + lx + '" y2="' + ly + '"/>';
      });
      gatesSVG += '<g transform="translate(' + G.x + ',' + G.y + ')">' + shape.body + leads + shape.label + '</g>';
      gatesSVG += '<text class="sig' + (vals[g.id] ? ' on' : '') + '" x="' + (G.x + GATE_W + 6) + '" y="' + (G.y + G.h / 2 - 6) + '">' + vals[g.id] + '</text>';
    });

    let inputsSVG = '';
    net.inputs.forEach((name) => {
      const p = L.pos[name], on = vals[name] ? 1 : 0, y = p.y - IN_H / 2;
      inputsSVG += '<g class="inp' + (on ? ' on' : '') + '" data-input="' + esc(name) + '" role="switch" tabindex="0"' +
        ' aria-checked="' + (on ? 'true' : 'false') + '" aria-label="Input ' + esc(name) + ', currently ' + on + '. Press to toggle.">' +
        '<rect class="inp-box" x="' + IN_X + '" y="' + y + '" width="' + IN_W + '" height="' + IN_H + '" rx="14"/>' +
        '<text class="inp-name" x="' + (IN_X + 12) + '" y="' + p.y + '">' + esc(name) + '</text>' +
        '<text class="inp-val" x="' + (IN_X + IN_W - 12) + '" y="' + p.y + '">' + on + '</text></g>';
    });

    let outsSVG = '';
    L.outs.forEach((o, i) => {
      const v = vals[o.from];
      addWire(L.pos[o.from].x, L.pos[o.from].y, L.outX, o.y, i, v);
      outsSVG += '<circle class="lamp' + (v ? ' on' : '') + '" cx="' + (L.outX + 11) + '" cy="' + o.y + '" r="10"/>' +
        '<text class="lamp-val' + (v ? ' on' : '') + '" x="' + (L.outX + 11) + '" y="' + o.y + '">' + v + '</text>' +
        '<text class="out-name" x="' + (L.outX + 28) + '" y="' + o.y + '">' + esc(o.name) + '</text>';
    });

    const scale = (opts && opts.scale) || 1;
    const label = (opts && opts.label) || 'Logic circuit';
    return '<svg class="circuit" viewBox="0 0 ' + L.width + ' ' + L.height + '" width="' + Math.round(L.width * scale) +
      '" height="' + Math.round(L.height * scale) + '" role="group" aria-label="' + esc(label) + '">' +
      lo.join('') + hi.join('') + gatesSVG + inputsSVG + outsSVG + '</svg>';
  }

  /**
   * Live circuit: draws a netlist, toggles inputs on click or Enter/Space, and calls opts.onChange.
   * opts: { scale, label, onChange({inputs, index, outputs}) }
   */
  function createCircuitView(container, opts) {
    opts = opts || {};
    const state = { net: null, inputs: {} };

    const info = () => {
      const res = LL.netlist.evalNetlist(state.net, state.inputs);
      return {
        inputs: Object.assign({}, state.inputs),
        index: state.net.inputs.reduce((a, n) => a * 2 + (state.inputs[n] ? 1 : 0), 0),
        outputs: res.outputs
      };
    };
    const draw = () => {
      container.innerHTML = renderSVG(state.net, state.inputs, LL.netlist.evalNetlist(state.net, state.inputs), opts);
    };
    const toggle = (name) => {
      state.inputs[name] = state.inputs[name] ? 0 : 1;
      draw();
      const again = Array.from(container.querySelectorAll('[data-input]')).find((el) => el.getAttribute('data-input') === name);
      if (again) again.focus();
      if (opts.onChange) opts.onChange(info());
    };

    container.addEventListener('click', (e) => {
      const el = e.target.closest ? e.target.closest('[data-input]') : null;
      if (el && state.net) toggle(el.getAttribute('data-input'));
    });
    container.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target.closest ? e.target.closest('[data-input]') : null;
      if (el && state.net) { e.preventDefault(); toggle(el.getAttribute('data-input')); }
    });

    return {
      setNetlist(net) {
        const prev = state.inputs;
        state.net = net;
        state.inputs = {};
        net.inputs.forEach((n) => { state.inputs[n] = prev[n] ? 1 : 0; });
        draw();
        if (opts.onChange) opts.onChange(info());
      },
      getInfo: info
    };
  }

  /* ===================== Karnaugh map ===================== */

  const CELL = 64, ML = 78, MT = 60;
  const GRAY = { 1: [0, 1], 2: [0, 1, 3, 2] };

  /** Describe the grid for n = 2, 3 or 4 variables. */
  function kmapLayout(n) {
    const rowBits = n === 4 ? 2 : 1;
    const colBits = n - rowBits;
    const rowGray = GRAY[rowBits], colGray = GRAY[colBits];
    return {
      rows: rowGray.length, cols: colGray.length, rowBits, colBits, rowGray, colGray,
      minterm: (r, c) => (rowGray[r] << colBits) | colGray[c],
      cellOf(m) {
        const rv = m >> colBits, cv = m & ((1 << colBits) - 1);
        return [rowGray.indexOf(rv), colGray.indexOf(cv)];
      }
    };
  }

  function groupOutline(cells, rows, cols, gi) {
    const set = new Set(cells.map((rc) => rc[0] + ',' + rc[1]));
    const rs = new Set(cells.map((rc) => rc[0])), cs = new Set(cells.map((rc) => rc[1]));
    const wrapR = rows > 2 && rs.size < rows, wrapC = cols > 2 && cs.size < cols;
    const inset = 4 + gi * 3;
    let out = '';
    const line = (x1, y1, x2, y2) => '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>';
    cells.forEach((rc) => {
      const r = rc[0], c = rc[1];
      const x = ML + c * CELL, y = MT + r * CELL;
      const has = (dr, dc) => {
        let nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= rows) { if (!wrapR) return false; nr = (nr + rows) % rows; }
        if (nc < 0 || nc >= cols) { if (!wrapC) return false; nc = (nc + cols) % cols; }
        return set.has(nr + ',' + nc);
      };
      const up = has(-1, 0), down = has(1, 0), left = has(0, -1), right = has(0, 1);
      const x1 = x + (left ? 0 : inset), x2 = x + CELL - (right ? 0 : inset);
      const y1 = y + (up ? 0 : inset), y2 = y + CELL - (down ? 0 : inset);
      if (!up) out += line(x1, y + inset, x2, y + inset);
      if (!down) out += line(x1, y + CELL - inset, x2, y + CELL - inset);
      if (!left) out += line(x + inset, y1, x + inset, y2);
      if (!right) out += line(x + CELL - inset, y1, x + CELL - inset, y2);
    });
    return out;
  }

  /**
   * opts: { n, names, cells (0/1/2 per minterm), groups: [{covers:[minterms]}] }
   * Cells are <g data-m="..."> so the page can toggle them with event delegation.
   */
  function kmapSVG(opts) {
    const n = opts.n, names = opts.names, K = kmapLayout(n);
    const W = ML + K.cols * CELL + 12, H = MT + K.rows * CELL + 12;
    const rowNames = names.slice(0, K.rowBits).join(''), colNames = names.slice(K.rowBits).join('');
    let s = '<svg class="kmap-svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H +
      '" role="group" aria-label="Karnaugh map">';

    s += '<line class="k-diag" x1="' + (ML - 64) + '" y1="' + (MT - 46) + '" x2="' + ML + '" y2="' + MT + '"/>';
    s += '<text class="k-var" x="' + (ML - 8) + '" y="' + (MT - 30) + '" text-anchor="end">' + esc(colNames) + '</text>';
    s += '<text class="k-var" x="' + (ML - 58) + '" y="' + (MT - 8) + '" text-anchor="start">' + esc(rowNames) + '</text>';

    for (let c = 0; c < K.cols; c++) {
      s += '<text class="k-axis" x="' + (ML + c * CELL + CELL / 2) + '" y="' + (MT - 10) + '" text-anchor="middle">' +
        K.colGray[c].toString(2).padStart(K.colBits, '0') + '</text>';
    }
    for (let r = 0; r < K.rows; r++) {
      s += '<text class="k-axis" x="' + (ML - 10) + '" y="' + (MT + r * CELL + CELL / 2) + '" text-anchor="end">' +
        K.rowGray[r].toString(2).padStart(K.rowBits, '0') + '</text>';
    }

    const labels = ['0', '1', 'X'];
    const classes = ['v0', 'v1', 'vx'];
    const inGroup = new Set();
    (opts.groups || []).forEach((g) => g.covers.forEach((m) => inGroup.add(m)));

    for (let r = 0; r < K.rows; r++) {
      for (let c = 0; c < K.cols; c++) {
        const m = K.minterm(r, c), v = opts.cells[m] || 0;
        const x = ML + c * CELL, y = MT + r * CELL;
        s += '<g class="kc" data-m="' + m + '" role="button" tabindex="0" aria-label="Minterm ' + m + ', value ' +
          labels[v] + '. Press to change.">' +
          '<rect class="k-cell" x="' + x + '" y="' + y + '" width="' + CELL + '" height="' + CELL + '"/>' +
          '<text class="k-idx" x="' + (x + CELL / 2) + '" y="' + (y + 21) + '" text-anchor="middle">m' + m + '</text>' +
          '<text class="k-val ' + classes[v] + '" x="' + (x + CELL / 2) + '" y="' + (y + CELL / 2 + 9) + '">' + labels[v] + '</text></g>';
      }
    }

    (opts.groups || []).forEach((g, gi) => {
      const cells = g.covers.map((m) => K.cellOf(m));
      cells.forEach((rc) => {
        s += '<rect class="g-tint gc' + (gi % 6) + '" x="' + (ML + rc[1] * CELL) + '" y="' + (MT + rc[0] * CELL) +
          '" width="' + CELL + '" height="' + CELL + '"/>';
      });
      s += '<g class="g-line gc' + (gi % 6) + '">' + groupOutline(cells, K.rows, K.cols, gi) + '</g>';
    });

    return s + '</svg>';
  }

  LL.render = { createCircuitView, kmapSVG, kmapLayout };

  if (typeof module !== 'undefined' && module.exports) module.exports = LL.render;
})(typeof window !== 'undefined' ? window : globalThis);
