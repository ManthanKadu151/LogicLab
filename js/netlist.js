/* netlist.js
 * A netlist is a plain description of a combinational circuit:
 *   { inputs:  ['A','B'],
 *     gates:   [{ id:'g1', type:'XOR', ins:['A','B'] }, ...],   // listed in evaluation order
 *     outputs: [{ name:'Sum', from:'g1' }] }
 * Signals are referred to by input name or gate id.
 */
(function (root) {
  'use strict';
  const LL = (root.LL = root.LL || {});

  /** Turn a parsed expression into a netlist. Identical sub-expressions share one gate. */
  function astToNetlist(ast, inputs) {
    const gates = [];
    const memo = new Map();
    let counter = 0;

    function mk(type, ins) {
      const key = type + '(' + ins.join(',') + ')';
      if (memo.has(key)) return memo.get(key);
      const id = 'g' + (++counter);
      gates.push({ id, type, ins });
      memo.set(key, id);
      return id;
    }

    function flatten(op, n) {
      if (n.type === 'bin' && n.op === op) return flatten(op, n.a).concat(flatten(op, n.b));
      return [n];
    }

    function build(n) {
      switch (n.type) {
        case 'var': return n.name;
        case 'const': throw new Error('Circuit drawing does not support the constants 0 and 1 inside an expression.');
        case 'not': return mk('NOT', [build(n.a)]);
        case 'bin':
          if (n.op === 'AND' || n.op === 'OR' || n.op === 'XOR') return mk(n.op, flatten(n.op, n).map(build));
          return mk(n.op, [build(n.a), build(n.b)]);
        default: throw new Error('Bad AST node');
      }
    }

    const from = build(ast);
    return { inputs: inputs.slice(), gates, outputs: [{ name: 'F', from }] };
  }

  /** Evaluate every signal. `inputValues` maps input name -> 0/1. */
  function evalNetlist(net, inputValues) {
    const values = {};
    net.inputs.forEach((n) => { values[n] = inputValues[n] ? 1 : 0; });
    net.gates.forEach((g) => {
      values[g.id] = LL.evalGate(g.type, g.ins.map((s) => values[s]));
    });
    const outputs = {};
    net.outputs.forEach((o) => { outputs[o.name] = values[o.from]; });
    return { values, outputs };
  }

  /** Truth table of a whole netlist: rows of {index, bits, outputs}. Inputs are MSB-first. */
  function netlistTable(net) {
    const n = net.inputs.length;
    const rows = [];
    for (let i = 0; i < (1 << n); i++) {
      const bits = LL.bitsOf(i, n);
      const vals = {};
      net.inputs.forEach((name, k) => { vals[name] = bits[k]; });
      rows.push({ index: i, bits, outputs: evalNetlist(net, vals).outputs });
    }
    return rows;
  }

  LL.netlist = { astToNetlist, evalNetlist, netlistTable };

  if (typeof module !== 'undefined' && module.exports) module.exports = LL.netlist;
})(typeof window !== 'undefined' ? window : globalThis);
