/* logic.js
 * Gate truth functions and small helpers.
 * Classic script (no modules) so the site works when index.html is opened from disk.
 * Everything is attached to one global namespace: window.LL
 */
(function (root) {
  'use strict';
  const LL = (root.LL = root.LL || {});

  /** Display information for the gate explorer. */
  const GATE_INFO = {
    NOT:  { blurb: 'Inverts its input: 0 becomes 1 and 1 becomes 0.', expr: "Y = A'" },
    AND:  { blurb: 'Output is 1 only when every input is 1.', expr: 'Y = A · B' },
    OR:   { blurb: 'Output is 1 when at least one input is 1.', expr: 'Y = A + B' },
    NAND: { blurb: 'AND followed by NOT. Output is 0 only when every input is 1. NAND is a universal gate: any circuit can be built from NAND alone.', expr: "Y = (A · B)'" },
    NOR:  { blurb: 'OR followed by NOT. Output is 1 only when every input is 0. NOR is also a universal gate.', expr: "Y = (A + B)'" },
    XOR:  { blurb: 'Output is 1 when the inputs differ (an odd number of 1s). It is the sum bit of a half adder.', expr: "Y = A ⊕ B = A'B + AB'" },
    XNOR: { blurb: 'Output is 1 when the inputs are equal. It is the complement of XOR.', expr: "Y = (A ⊕ B)' = AB + A'B'" }
  };

  /** Evaluate one gate. `ins` is an array of 0/1 values (any length for AND/OR/XOR families). */
  function evalGate(type, ins) {
    switch (type) {
      case 'NOT':  return ins[0] ? 0 : 1;
      case 'BUF':  return ins[0] ? 1 : 0;
      case 'AND':  return ins.every(Boolean) ? 1 : 0;
      case 'NAND': return ins.every(Boolean) ? 0 : 1;
      case 'OR':   return ins.some(Boolean) ? 1 : 0;
      case 'NOR':  return ins.some(Boolean) ? 0 : 1;
      case 'XOR':  return ins.reduce((a, b) => a ^ (b ? 1 : 0), 0);
      case 'XNOR': return 1 ^ ins.reduce((a, b) => a ^ (b ? 1 : 0), 0);
      default: throw new Error('Unknown gate type: ' + type);
    }
  }

  /** Row index -> array of n bits, most significant bit first (A is the MSB). */
  function bitsOf(index, n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) out.push((index >> i) & 1);
    return out;
  }

  /** Array of bits (MSB first) -> row index. */
  function indexOfBits(bits) {
    return bits.reduce((acc, b) => acc * 2 + (b ? 1 : 0), 0);
  }

  /** Escape text before putting it into innerHTML. */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  LL.GATE_INFO = GATE_INFO;
  LL.evalGate = evalGate;
  LL.bitsOf = bitsOf;
  LL.indexOfBits = indexOfBits;
  LL.esc = esc;

  if (typeof module !== 'undefined' && module.exports) module.exports = LL;
})(typeof window !== 'undefined' ? window : globalThis);
