/* qm.js
 * Quine-McCluskey minimisation.
 *
 *   qm(n, minterms, dontCares) -> {
 *     n, ones, dcs,
 *     steps:  columns of implicants produced while combining (for display),
 *     primes: [{bits, covers, coversOnes, essential, inSolution}],
 *     solution: [bits...]            // chosen minimal cover
 *   }
 * `bits` is a string such as "1-01" (MSB first, '-' = variable eliminated).
 *
 * Steps: 1) group terms by number of 1s  2) combine groups that differ in one bit
 * 3) repeat until nothing combines; terms never combined are the prime implicants
 * 4) take essential primes  5) cover what is left with Petrick's method.
 */
(function (root) {
  'use strict';
  const LL = (root.LL = root.LL || {});

  const uniqSorted = (a) => Array.from(new Set(a)).sort((x, y) => x - y);
  const countOnes = (s) => (s.match(/1/g) || []).length;
  const literalCount = (s) => (s.match(/[01]/g) || []).length;

  function diffPos(a, b) {
    let pos = -1;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      if (a[i] === '-' || b[i] === '-') return -1;
      if (pos !== -1) return -1;
      pos = i;
    }
    return pos;
  }

  function isSubset(small, big) {
    for (const x of small) if (!big.has(x)) return false;
    return true;
  }

  function absorb(list) {
    list.sort((a, b) => a.size - b.size);
    const out = [];
    for (const s of list) if (!out.some((o) => isSubset(o, s))) out.push(s);
    return out;
  }

  function greedy(remaining, cand, P) {
    const left = new Set(remaining);
    const picked = [];
    while (left.size) {
      let best = -1, bestCount = -1;
      for (const i of cand) {
        if (picked.includes(i)) continue;
        const c = P[i].coversOnes.filter((m) => left.has(m)).length;
        if (c > bestCount) { best = i; bestCount = c; }
      }
      if (best < 0 || bestCount === 0) break;
      picked.push(best);
      P[best].coversOnes.forEach((m) => left.delete(m));
    }
    return picked;
  }

  /** Petrick's method: expand the product of sums, keep the cheapest cover. */
  function petrick(remaining, cand, P) {
    let terms = [new Set()];
    for (const m of remaining) {
      const clause = cand.filter((i) => P[i].coversOnes.includes(m));
      const next = [];
      for (const t of terms) {
        for (const i of clause) {
          const s = new Set(t);
          s.add(i);
          next.push(s);
        }
      }
      terms = absorb(next);
      if (terms.length > 4000) return greedy(remaining, cand, P);
    }
    let best = null, bestKey = null;
    for (const t of terms) {
      const lit = Array.from(t).reduce((s, i) => s + literalCount(P[i].bits), 0);
      if (!best || t.size < bestKey[0] || (t.size === bestKey[0] && lit < bestKey[1])) {
        best = t;
        bestKey = [t.size, lit];
      }
    }
    return best ? Array.from(best) : [];
  }

  function qm(n, minterms, dontCares) {
    const ones = uniqSorted(minterms);
    const dcs = uniqSorted(dontCares || []).filter((d) => !ones.includes(d));
    const steps = [];
    if (ones.length === 0) return { n, ones, dcs, steps, primes: [], solution: [] };

    const toBits = (m) => m.toString(2).padStart(n, '0');
    let current = ones.concat(dcs).sort((a, b) => a - b).map((m) => ({ bits: toBits(m), covers: [m], used: false }));
    const primes = [];

    while (current.length) {
      steps.push(current.map((c) => ({ bits: c.bits, covers: c.covers.slice() })));
      const groups = new Map();
      current.forEach((c) => {
        const k = countOnes(c.bits);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(c);
      });
      const next = new Map();
      Array.from(groups.keys()).sort((a, b) => a - b).forEach((k) => {
        const g1 = groups.get(k), g2 = groups.get(k + 1);
        if (!g2) return;
        g1.forEach((a) => g2.forEach((b) => {
          const pos = diffPos(a.bits, b.bits);
          if (pos < 0) return;
          a.used = true;
          b.used = true;
          const bits = a.bits.slice(0, pos) + '-' + a.bits.slice(pos + 1);
          if (!next.has(bits)) next.set(bits, { bits, covers: uniqSorted(a.covers.concat(b.covers)), used: false });
        }));
      });
      current.forEach((c) => { if (!c.used) primes.push({ bits: c.bits, covers: c.covers }); });
      current = Array.from(next.values());
    }

    const P = primes.map((p) => ({
      bits: p.bits,
      covers: p.covers,
      coversOnes: p.covers.filter((m) => ones.includes(m)),
      essential: false,
      inSolution: false
    }));
    const useful = P.map((_, i) => i).filter((i) => P[i].coversOnes.length > 0);
    const chosen = new Set();

    ones.forEach((m) => {
      const cands = useful.filter((i) => P[i].coversOnes.includes(m));
      if (cands.length === 1) { P[cands[0]].essential = true; chosen.add(cands[0]); }
    });

    const remaining = ones.filter((m) => !Array.from(chosen).some((i) => P[i].coversOnes.includes(m)));
    if (remaining.length) {
      const cand = useful.filter((i) => !chosen.has(i));
      petrick(remaining, cand, P).forEach((i) => chosen.add(i));
    }
    chosen.forEach((i) => { P[i].inSolution = true; });

    const solution = Array.from(chosen)
      .sort((a, b) => P[a].covers[0] - P[b].covers[0])
      .map((i) => P[i].bits);
    return { n, ones, dcs, steps, primes: P, solution };
  }

  /* ---------- formatting helpers ---------- */

  const lit = (bit, name) => (bit === '1' ? name : name + "'");

  /** Product term: "10-1" with names [A,B,C,D] -> AB'D */
  function termSOP(bits, names) {
    let s = '';
    for (let i = 0; i < bits.length; i++) if (bits[i] !== '-') s += lit(bits[i], names[i]);
    return s || '1';
  }

  /** Sum term for a *complement* implicant (used for POS): bit 1 -> A', bit 0 -> A */
  function termPOS(bits, names) {
    const parts = [];
    for (let i = 0; i < bits.length; i++) {
      if (bits[i] === '-') continue;
      parts.push(bits[i] === '1' ? names[i] + "'" : names[i]);
    }
    return parts.join(' + ');
  }

  function formatSOP(res, names) {
    if (res.ones.length === 0) return '0';
    const terms = res.solution.map((b) => termSOP(b, names));
    if (terms.indexOf('1') !== -1) return '1';
    return terms.join(' + ');
  }

  /** `resZeros` is qm() run on the zeros of the function. */
  function formatPOS(resZeros, names) {
    if (resZeros.ones.length === 0) return '1';
    const sums = resZeros.solution.map((b) => termPOS(b, names));
    if (sums.indexOf('') !== -1) return '0';
    if (sums.length === 1) return sums[0];
    return sums.map((s) => (s.indexOf(' ') === -1 ? s : '(' + s + ')')).join('');
  }

  function canonicalSOP(ones, n, names) {
    if (!ones.length) return '0';
    return ones.map((m) => termSOP(m.toString(2).padStart(n, '0'), names)).join(' + ');
  }

  function canonicalPOS(zeros, n, names) {
    if (!zeros.length) return '1';
    return zeros.map((m) => '(' + termPOS(m.toString(2).padStart(n, '0'), names) + ')').join('');
  }

  /** Build an AST for the minimised SOP so the circuit view can draw it. */
  function sopToAst(res, names) {
    if (res.ones.length === 0) return { type: 'const', value: 0 };
    const products = [];
    for (const b of res.solution) {
      const lits = [];
      for (let i = 0; i < b.length; i++) {
        if (b[i] === '-') continue;
        const v = { type: 'var', name: names[i] };
        lits.push(b[i] === '1' ? v : { type: 'not', a: v });
      }
      if (lits.length === 0) return { type: 'const', value: 1 };
      products.push(lits.reduce((a, c) => ({ type: 'bin', op: 'AND', a, b: c })));
    }
    return products.reduce((a, c) => ({ type: 'bin', op: 'OR', a, b: c }));
  }

  /** Both minimised forms for a function given by its minterms and don't-cares. */
  function minimise(n, ones, dcs, names) {
    const dcSet = new Set(dcs || []);
    const oneSet = new Set(ones);
    const zeros = [];
    for (let m = 0; m < (1 << n); m++) if (!oneSet.has(m) && !dcSet.has(m)) zeros.push(m);
    const sop = qm(n, ones, dcs);
    const pos = qm(n, zeros, dcs);
    return {
      sop, pos, zeros,
      sopText: formatSOP(sop, names),
      posText: formatPOS(pos, names),
      sopAst: sopToAst(sop, names)
    };
  }

  LL.qm = { qm, minimise, termSOP, termPOS, formatSOP, formatPOS, canonicalSOP, canonicalPOS, sopToAst };

  if (typeof module !== 'undefined' && module.exports) module.exports = LL.qm;
})(typeof window !== 'undefined' ? window : globalThis);
