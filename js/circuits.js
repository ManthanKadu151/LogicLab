/* circuits.js
 * Ready-made combinational circuits, described as netlists (see netlist.js).
 * To add a circuit, append an object to LL.CIRCUITS. Gates must be listed in evaluation order.
 */
(function (root) {
  'use strict';
  const LL = (root.LL = root.LL || {});

  LL.CIRCUITS = [
    {
      id: 'half-adder',
      name: 'Half adder',
      blurb: 'Adds two bits. Sum is 1 when the inputs differ; Carry is 1 when both are 1.',
      equations: ['Sum = A ⊕ B', 'Carry = A · B'],
      net: {
        inputs: ['A', 'B'],
        gates: [
          { id: 'x1', type: 'XOR', ins: ['A', 'B'] },
          { id: 'a1', type: 'AND', ins: ['A', 'B'] }
        ],
        outputs: [{ name: 'Sum', from: 'x1' }, { name: 'Carry', from: 'a1' }]
      }
    },
    {
      id: 'full-adder',
      name: 'Full adder',
      blurb: 'Adds two bits plus a carry-in. Two half adders and an OR gate.',
      equations: ['Sum = A ⊕ B ⊕ Cin', 'Cout = A·B + Cin·(A ⊕ B)'],
      net: {
        inputs: ['A', 'B', 'Cin'],
        gates: [
          { id: 'x1', type: 'XOR', ins: ['A', 'B'] },
          { id: 'x2', type: 'XOR', ins: ['x1', 'Cin'] },
          { id: 'a1', type: 'AND', ins: ['A', 'B'] },
          { id: 'a2', type: 'AND', ins: ['x1', 'Cin'] },
          { id: 'o1', type: 'OR', ins: ['a1', 'a2'] }
        ],
        outputs: [{ name: 'Sum', from: 'x2' }, { name: 'Cout', from: 'o1' }]
      }
    },
    {
      id: 'mux-2',
      name: '2:1 multiplexer',
      blurb: 'Selects one of two data inputs. S = 0 passes I0, S = 1 passes I1.',
      equations: ["Y = S'·I0 + S·I1"],
      net: {
        inputs: ['I0', 'I1', 'S'],
        gates: [
          { id: 'n1', type: 'NOT', ins: ['S'] },
          { id: 'a1', type: 'AND', ins: ['I0', 'n1'] },
          { id: 'a2', type: 'AND', ins: ['I1', 'S'] },
          { id: 'o1', type: 'OR', ins: ['a1', 'a2'] }
        ],
        outputs: [{ name: 'Y', from: 'o1' }]
      }
    },
    {
      id: 'mux-4',
      name: '4:1 multiplexer',
      blurb: 'Selects one of four data inputs using two select lines. S1 S0 = 10 passes I2, for example.',
      equations: ["Y = S1'·S0'·I0 + S1'·S0·I1 + S1·S0'·I2 + S1·S0·I3"],
      net: {
        inputs: ['I0', 'I1', 'I2', 'I3', 'S1', 'S0'],
        gates: [
          { id: 'n1', type: 'NOT', ins: ['S1'] },
          { id: 'n0', type: 'NOT', ins: ['S0'] },
          { id: 'a0', type: 'AND', ins: ['I0', 'n1', 'n0'] },
          { id: 'a1', type: 'AND', ins: ['I1', 'n1', 'S0'] },
          { id: 'a2', type: 'AND', ins: ['I2', 'S1', 'n0'] },
          { id: 'a3', type: 'AND', ins: ['I3', 'S1', 'S0'] },
          { id: 'o1', type: 'OR', ins: ['a0', 'a1', 'a2', 'a3'] }
        ],
        outputs: [{ name: 'Y', from: 'o1' }]
      }
    },
    {
      id: 'decoder-2',
      name: '2-to-4 decoder',
      blurb: 'Turns a 2-bit number into one active line. Exactly one of D0 to D3 is 1.',
      equations: ["D0 = A1'·A0'", "D1 = A1'·A0", "D2 = A1·A0'", 'D3 = A1·A0'],
      net: {
        inputs: ['A1', 'A0'],
        gates: [
          { id: 'n1', type: 'NOT', ins: ['A1'] },
          { id: 'n0', type: 'NOT', ins: ['A0'] },
          { id: 'd0', type: 'AND', ins: ['n1', 'n0'] },
          { id: 'd1', type: 'AND', ins: ['n1', 'A0'] },
          { id: 'd2', type: 'AND', ins: ['A1', 'n0'] },
          { id: 'd3', type: 'AND', ins: ['A1', 'A0'] }
        ],
        outputs: [{ name: 'D0', from: 'd0' }, { name: 'D1', from: 'd1' }, { name: 'D2', from: 'd2' }, { name: 'D3', from: 'd3' }]
      }
    }
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = LL.CIRCUITS;
})(typeof window !== 'undefined' ? window : globalThis);
