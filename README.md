# LogicLab: digital logic simulator (front-end)

A browser-based tool for Digital Logic Design. No install, no backend, no database.
Open `index.html` in Chrome, Edge or Firefox (double-click is enough), or host the folder on GitHub Pages or Netlify.

## What it does

| Tab | Features |
|---|---|
| Gates | AND, OR, NOT, NAND, NOR, XOR, XNOR with clickable inputs, live wires and a truth table that highlights the current row |
| Expressions | Parses a Boolean expression, builds the truth table, shows Σm / ΠM, canonical and minimised SOP and POS, draws the gate circuit (as typed or simplified) |
| K-map | 2, 3 and 4 variables, don't cares, groups drawn on the map (including wrap-around), SOP and POS |
| Circuits | Half adder, full adder, 2:1 mux, 4:1 mux, 2-to-4 decoder, drawn as live gate diagrams |
| Number systems | Binary, octal, decimal and hexadecimal conversion |

## Expression syntax

NOT `A'` `!A` `~A` `NOT A`, AND `A.B` `A*B` `A&B` `AB` `A AND B`, OR `A+B` `A|B` `A OR B`,
XOR `A^B` `A⊕B`, plus `NAND`, `NOR`, `XNOR` words, constants `0` and `1`.
Variables are single letters, so `ABC` means A·B·C. Precedence: NOT, AND, XOR, OR. Up to 6 variables.

## Files

```
index.html          page structure (all five tabs)
css/style.css       theme tokens (light and dark) and all styling
js/logic.js         gate functions, bit helpers
js/parser.js        tokenizer, recursive-descent parser, evaluator, truth tables
js/qm.js            Quine-McCluskey, Petrick's method, SOP/POS formatting
js/netlist.js       expression -> circuit, circuit evaluation
js/circuits.js      the ready-made circuits (add new ones here)
js/render.js        SVG gate symbols, circuit layout, K-map drawing
js/app.js           connects everything to the page
tests/logic.test.js 60 automated checks for the engine
```

Scripts are plain classic scripts (not ES modules) so the site works from `file://`.
There are no inline scripts, inline styles or `onclick` attributes, so a strict Content-Security-Policy works.

## Run the tests

```
node tests/logic.test.js
```

Covers gates, parser precedence and error cases, algebra identities (De Morgan, absorption, consensus),
Quine-McCluskey on known answers and on 160 random functions (checked against the original and for minimality),
and every row of the adders, multiplexers and decoder. Use the output as the "test cases" section of the report.

## How the main algorithms work

- **Parser:** the tokenizer turns text into tokens, then a recursive-descent parser builds a tree.
  One function per precedence level (OR, XOR, AND, NOT), so precedence comes from the call order.
  Two variables next to each other become an implicit AND.
- **Truth table:** for each of the 2^n input combinations, evaluate the tree.
- **Quine-McCluskey:** group minterms by number of 1s, combine groups that differ in one bit (that bit becomes `-`),
  repeat until nothing combines. What is left are the prime implicants. Take the essential ones, then cover the rest with Petrick's method.
- **POS:** minimise the zeros of the function, then complement each term (De Morgan).
- **K-map groups:** each chosen prime implicant covers a set of cells. Edges are drawn only where the neighbour cell is not in the group,
  and neighbours wrap around the map edges, which gives the open-ended look of wrap-around groups.

## Known limits

- Front-end only: nothing is saved or shared between users.
- K-map supports up to 4 variables. The expression tool supports up to 6.
- No sequential circuits (flip-flops), no drag-and-drop circuit builder.
- Circuit diagrams use an automatic layout, so large circuits can have crossing wires.

## Ideas for the next version

Flip-flops with a timing diagram, a drag-and-drop circuit builder, saving circuits to a backend, an exportable PDF of the truth table.
