/* Run with:  node tests/logic.test.js
 * No dependencies. Prints one line per check and exits with code 1 if anything fails.
 * These double as the "test cases" section of the project report.
 */
'use strict';
const path = require('path');
const root = path.join(__dirname, '..', 'js');
require(path.join(root, 'logic.js'));
require(path.join(root, 'parser.js'));
require(path.join(root, 'qm.js'));
require(path.join(root, 'netlist.js'));
require(path.join(root, 'circuits.js'));
const LL = globalThis.LL;

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  ok   ' + name); }
  else { failed++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
}
const outs = (expr, vars) => {
  const ast = LL.parser.parse(expr);
  return LL.parser.truthTable(ast, vars || LL.parser.variables(ast)).map((r) => r.out).join('');
};
const throws = (expr) => { try { LL.parser.parse(expr); return false; } catch (e) { return e instanceof LL.parser.ParseError; } };

console.log('Gates');
check('AND',  [0, 1].every((a) => [0, 1].every((b) => LL.evalGate('AND', [a, b]) === (a & b))));
check('OR',   [0, 1].every((a) => [0, 1].every((b) => LL.evalGate('OR', [a, b]) === (a | b))));
check('XOR',  [0, 1].every((a) => [0, 1].every((b) => LL.evalGate('XOR', [a, b]) === (a ^ b))));
check('NAND', LL.evalGate('NAND', [1, 1]) === 0 && LL.evalGate('NAND', [0, 1]) === 1);
check('NOR',  LL.evalGate('NOR', [0, 0]) === 1 && LL.evalGate('NOR', [1, 0]) === 0);
check('XNOR', LL.evalGate('XNOR', [1, 1]) === 1 && LL.evalGate('XNOR', [1, 0]) === 0);
check('NOT',  LL.evalGate('NOT', [0]) === 1 && LL.evalGate('NOT', [1]) === 0);
check('3-input AND / OR / XOR (parity)', LL.evalGate('AND', [1, 1, 1]) === 1 && LL.evalGate('OR', [0, 0, 1]) === 1 && LL.evalGate('XOR', [1, 1, 1]) === 1);

console.log('Parser: syntax and precedence');
check("A.B + A'.C", outs("A.B + A'.C") === '01010011'.split('').map((_, i) => { const A = (i >> 2) & 1, B = (i >> 1) & 1, C = i & 1; return (A & B) | ((1 - A) & C); }).join(''));
check('implicit AND: AB == A.B == A*B == A&B', ['AB', 'A.B', 'A*B', 'A&B', 'A AND B', 'A·B'].every((e) => outs(e, ['A', 'B']) === '0001'));
check('OR forms: A+B == A|B == A OR B', ['A+B', 'A|B', 'A OR B', 'A||B'].every((e) => outs(e, ['A', 'B']) === '0111'));
check('NOT forms: A\' == !A == ~A == NOT A', ["A'", '!A', '~A', 'NOT A'].every((e) => outs(e, ['A']) === '10'));
check('AND binds tighter than OR: A+B.C', outs('A+B.C', ['A', 'B', 'C']) === '01010111'.replace(/./g, (c, i) => String((((i >> 2) & 1) | (((i >> 1) & 1) & (i & 1))))));
check('XOR sits between AND and OR: A+B^C == A+(B^C)', outs('A+B^C') === outs('A+(B^C)'));
check('parentheses override precedence', outs('(A+B).C', ['A', 'B', 'C']) !== outs('A+B.C', ['A', 'B', 'C']));
check('postfix NOT on a group: (A+B)\' == A\'B\'', outs("(A+B)'", ['A', 'B']) === outs("A'B'", ['A', 'B']));
check('double NOT: A\'\' == A', outs("A''", ['A']) === '01');
check('lowercase variables: a.b', outs('a.b', ['A', 'B']) === '0001');
check('NAND / NOR / XNOR words', outs('A NAND B') === '1110' && outs('A NOR B') === '1000' && outs('A XNOR B') === '1001');
check('constants: A+0 == A, A.1 == A', outs('A+0', ['A']) === '01' && outs('A.1', ['A']) === '01');
check('NOT before an implicit AND: A !B', outs('A !B', ['A', 'B']) === '0010');
check('variables are collected and sorted', LL.parser.variables(LL.parser.parse('C + A.B + a')).join('') === 'ABC');

console.log('Parser: errors');
check('empty input', throws(''));
check('dangling operator: A +', throws('A +'));
check('missing operand: A + * B', throws('A + * B'));
check('unclosed parenthesis', throws('(A + B'));
check('extra closing parenthesis', throws('A + B)'));
check('stray prime: \'A', throws("'A"));
check('bad character: A # B', throws('A # B'));
check('digit other than 0/1: A + 2', throws('A + 2'));
check('error position is reported', (() => { try { LL.parser.parse('A + * B'); } catch (e) { return e.pos === 4; } return false; })());

console.log('Truth-table identities');
check("De Morgan: (AB)' == A'+B'", outs("(AB)'", ['A', 'B']) === outs("A'+B'", ['A', 'B']));
check("De Morgan: (A+B)' == A'B'", outs("(A+B)'", ['A', 'B']) === outs("A'B'", ['A', 'B']));
check('Absorption: A + AB == A', outs('A+AB', ['A', 'B']) === outs('A', ['A', 'B']));
check('Consensus: AB + A\'C + BC == AB + A\'C', outs("AB+A'C+BC") === outs("AB+A'C"));
check('XOR expansion: A^B == A\'B + AB\'', outs('A^B') === outs("A'B+AB'"));
check('Distribution: A(B+C) == AB + AC', outs('A(B+C)') === outs('AB+AC'));

console.log('Quine-McCluskey: known answers');
const N2 = ['A', 'B'], N3 = ['A', 'B', 'C'], N4 = ['A', 'B', 'C', 'D'];
const M = (n, ones, dcs, names) => LL.qm.minimise(n, ones, dcs || [], names);
check('empty function -> 0', M(2, [], [], N2).sopText === '0');
check('all ones -> 1', M(2, [0, 1, 2, 3], [], N2).sopText === '1');
check('m(1,3) over A,B -> B', M(2, [1, 3], [], N2).sopText === 'B');
check("XOR m(1,2) -> A'B + AB'", M(2, [1, 2], [], N2).sopText === "A'B + AB'");
check('XOR POS -> (A + B)(A\' + B\')', M(2, [1, 2], [], N2).posText === "(A + B)(A' + B')");
check('m(0,1,2,3) over 3 vars -> A\'', M(3, [0, 1, 2, 3], [], N3).sopText === "A'");
check('m(1,3,5,7) -> C', M(3, [1, 3, 5, 7], [], N3).sopText === 'C');
check('single minterm m(5) over 3 vars -> AB\'C', M(3, [5], [], N3).sopText === "AB'C");
check('all-zero POS: m() has POS 0', M(2, [], [], N2).posText === '0');
check('all-one POS: has POS 1', M(2, [0, 1, 2, 3], [], N2).posText === '1');
{
  // Textbook example (Wikipedia): f = Σm(4,8,10,11,12,15) + d(9,14)  ->  AB' ... verify by equivalence below
  const r = M(4, [4, 8, 10, 11, 12, 15], [9, 14], N4);
  check('don\'t-cares: result has 3 terms', r.sopText.split(' + ').length === 3, r.sopText);
}
{
  // classic 4-variable: Σm(0,1,2,5,8,9,10) -> B'D' + B'C' + A'C'D   (3 terms is minimal)
  const r = M(4, [0, 1, 2, 5, 8, 9, 10], [], N4);
  check('Σm(0,1,2,5,8,9,10) minimal cover has 3 terms', r.sopText.split(' + ').length === 3, r.sopText);
}
check('cyclic cover (Petrick): Σm(0,1,2,5,6,7) needs 3 terms', M(3, [0, 1, 2, 5, 6, 7], [], N3).sopText.split(' + ').length === 3);

console.log('Quine-McCluskey: random functions are equivalent to the source (and parse back)');
{
  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  let allEquivalent = true, allMinimalOrEqual = true, runs = 0;
  for (let n = 2; n <= 5; n++) {
    const names = ['A', 'B', 'C', 'D', 'E'].slice(0, n);
    for (let t = 0; t < 40; t++) {
      const ones = [], dcs = [];
      for (let m = 0; m < (1 << n); m++) { const x = rnd(); if (x < 0.4) ones.push(m); else if (x < 0.55) dcs.push(m); }
      const r = LL.qm.minimise(n, ones, dcs, names);
      runs++;
      // SOP and POS, parsed back with the real parser, must match on every non-don't-care row
      const sop = LL.parser.parse(r.sopText), pos = LL.parser.parse(r.posText);
      for (let m = 0; m < (1 << n); m++) {
        if (dcs.includes(m)) continue;
        const env = {}; names.forEach((nm, k) => { env[nm] = (m >> (n - 1 - k)) & 1; });
        const want = ones.includes(m) ? 1 : 0;
        if (LL.parser.evaluate(sop, env) !== want || LL.parser.evaluate(pos, env) !== want) allEquivalent = false;
      }
      // brute-force: no cover of primes with fewer terms exists (only checked when small)
      const P = r.sop.primes.filter((p) => p.coversOnes.length);
      if (ones.length && P.length <= 14) {
        const target = r.sop.solution.length;
        for (let mask = 1; mask < (1 << P.length); mask++) {
          let cnt = 0; for (let b = mask; b; b &= b - 1) cnt++;
          if (cnt >= target) continue;
          const covered = new Set();
          P.forEach((p, i) => { if ((mask >> i) & 1) p.coversOnes.forEach((m) => covered.add(m)); });
          if (ones.every((m) => covered.has(m))) { allMinimalOrEqual = false; break; }
        }
      }
    }
  }
  check('SOP and POS equal the original on ' + runs + ' random functions (2-5 variables)', allEquivalent);
  check('no smaller cover exists (brute-force check)', allMinimalOrEqual);
}

console.log('Netlist from expressions');
{
  let ok = true;
  ['A.B + A\'.C', 'A^B^C', '(A+B)(A\'+C)', 'A NAND B', 'A NOR (B XNOR C)', "AB+A'C+BC"].forEach((e) => {
    const ast = LL.parser.parse(e);
    const vars = LL.parser.variables(ast);
    const net = LL.netlist.astToNetlist(ast, vars);
    const rows = LL.parser.truthTable(ast, vars);
    LL.netlist.netlistTable(net).forEach((row, i) => { if (row.outputs.F !== rows[i].out) ok = false; });
  });
  check('drawn circuit gives the same outputs as the expression', ok);
}
check('identical sub-expressions share a gate', LL.netlist.astToNetlist(LL.parser.parse("A'B + A'C"), ['A', 'B', 'C']).gates.filter((g) => g.type === 'NOT').length === 1);
check('constants are refused for drawing', (() => { try { LL.netlist.astToNetlist(LL.parser.parse('A+1'), ['A']); return false; } catch (e) { return true; } })());

console.log('Ready-made circuits');
{
  const get = (id) => LL.CIRCUITS.find((c) => c.id === id).net;
  const run = (net, vals) => LL.netlist.evalNetlist(net, vals).outputs;
  let ha = true, fa = true, m2 = true, m4 = true, dec = true;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
    const o = run(get('half-adder'), { A: a, B: b });
    if (o.Sum !== (a ^ b) || o.Carry !== (a & b)) ha = false;
    for (let c = 0; c < 2; c++) {
      const f = run(get('full-adder'), { A: a, B: b, Cin: c });
      const total = a + b + c;
      if (f.Sum !== (total & 1) || f.Cout !== (total >> 1)) fa = false;
    }
  }
  for (let i0 = 0; i0 < 2; i0++) for (let i1 = 0; i1 < 2; i1++) for (let s = 0; s < 2; s++) {
    if (run(get('mux-2'), { I0: i0, I1: i1, S: s }).Y !== (s ? i1 : i0)) m2 = false;
  }
  for (let m = 0; m < 64; m++) {
    const I = [(m >> 5) & 1, (m >> 4) & 1, (m >> 3) & 1, (m >> 2) & 1], sel = m & 3;
    const y = run(get('mux-4'), { I0: I[0], I1: I[1], I2: I[2], I3: I[3], S1: (sel >> 1) & 1, S0: sel & 1 }).Y;
    if (y !== I[sel]) m4 = false;
  }
  for (let v = 0; v < 4; v++) {
    const o = run(get('decoder-2'), { A1: (v >> 1) & 1, A0: v & 1 });
    for (let k = 0; k < 4; k++) if (o['D' + k] !== (k === v ? 1 : 0)) dec = false;
  }
  check('half adder: all 4 rows', ha);
  check('full adder: all 8 rows equal a+b+cin', fa);
  check('2:1 mux: all 8 rows', m2);
  check('4:1 mux: all 64 rows select the right input', m4);
  check('2-to-4 decoder: exactly one active line', dec);
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
