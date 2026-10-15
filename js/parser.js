/* parser.js
 * Boolean expression parser (tokenizer + recursive descent) and evaluator.
 *
 * Grammar, lowest to highest precedence:
 *   expr   := xor  ( (OR | NOR)  xor )*
 *   xor    := and  ( (XOR | XNOR) and )*
 *   and    := unary ( (AND | NAND)? unary )*     <- adjacency means AND:  AB, A(B+C), A'B
 *   unary  := NOT unary | postfix
 *   postfix:= primary ( ' )*                    <- A' is NOT A
 *   primary:= VARIABLE | 0 | 1 | ( expr )
 *
 * Variables are single letters A-Z (case-insensitive). "AB" means A AND B.
 * The AST is plain objects:
 *   {type:'var', name}  {type:'const', value}  {type:'not', a}  {type:'bin', op, a, b}
 */
(function (root) {
  'use strict';
  const LL = (root.LL = root.LL || {});

  class ParseError extends Error {
    constructor(message, pos) {
      super(message);
      this.name = 'ParseError';
      this.pos = pos; // index into the source string where the problem is
    }
  }

  const WORDS = { AND: 'AND', OR: 'OR', NOT: 'NOT', XOR: 'XOR', XNOR: 'XNOR', NAND: 'NAND', NOR: 'NOR' };

  function tokenize(src) {
    const toks = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }

      if (/[A-Za-z]/.test(c)) {
        let j = i;
        while (j < src.length && /[A-Za-z]/.test(src[j])) j++;
        const word = src.slice(i, j);
        const up = word.toUpperCase();
        if (WORDS[up]) {
          toks.push({ type: WORDS[up], text: word, pos: i });
        } else {
          // a run of letters such as "ABC" is the product A.B.C
          for (let k = 0; k < word.length; k++) {
            toks.push({ type: 'VAR', name: word[k].toUpperCase(), text: word[k], pos: i + k });
          }
        }
        i = j;
        continue;
      }

      if (c === '0' || c === '1') { toks.push({ type: 'CONST', value: Number(c), text: c, pos: i }); i++; continue; }
      if (/[2-9]/.test(c)) throw new ParseError('Only 0 and 1 can be used as constants.', i);

      const start = i;
      switch (c) {
        case "'": case '’': case '′':
          toks.push({ type: 'PRIME', text: c, pos: start }); break;
        case '!': case '~': case '¬':
          toks.push({ type: 'NOT', text: c, pos: start }); break;
        case '.': case '*': case '·': case '∧': case '&':
          if (c === '&' && src[i + 1] === '&') i++;
          toks.push({ type: 'AND', text: c, pos: start }); break;
        case '+': case '|': case '∨':
          if (c === '|' && src[i + 1] === '|') i++;
          toks.push({ type: 'OR', text: c, pos: start }); break;
        case '^': case '⊕':
          toks.push({ type: 'XOR', text: c, pos: start }); break;
        case '⊙':
          toks.push({ type: 'XNOR', text: c, pos: start }); break;
        case '(':
          toks.push({ type: 'LPAREN', text: c, pos: start }); break;
        case ')':
          toks.push({ type: 'RPAREN', text: c, pos: start }); break;
        default:
          throw new ParseError("Unrecognised character '" + c + "'.", i);
      }
      i++;
    }
    return toks;
  }

  function parse(src) {
    const toks = tokenize(src);
    if (toks.length === 0) throw new ParseError('Type an expression, for example A.B + A\'.C', 0);
    let p = 0;
    const peek = () => toks[p];
    const endPos = src.length;

    const startsUnary = (t) => t && (t.type === 'VAR' || t.type === 'CONST' || t.type === 'LPAREN' || t.type === 'NOT');

    function parseOr() {
      let left = parseXor();
      while (peek() && (peek().type === 'OR' || peek().type === 'NOR')) {
        const op = toks[p++].type;
        left = { type: 'bin', op, a: left, b: parseXor() };
      }
      return left;
    }

    function parseXor() {
      let left = parseAnd();
      while (peek() && (peek().type === 'XOR' || peek().type === 'XNOR')) {
        const op = toks[p++].type;
        left = { type: 'bin', op, a: left, b: parseAnd() };
      }
      return left;
    }

    function parseAnd() {
      let left = parseUnary();
      for (;;) {
        const t = peek();
        if (!t) break;
        if (t.type === 'AND' || t.type === 'NAND') {
          p++;
          left = { type: 'bin', op: t.type, a: left, b: parseUnary() };
        } else if (startsUnary(t)) {
          left = { type: 'bin', op: 'AND', a: left, b: parseUnary() }; // implicit AND
        } else {
          break;
        }
      }
      return left;
    }

    function parseUnary() {
      const t = peek();
      if (!t) throw new ParseError('The expression ends too early. Something is missing after the last operator.', endPos);
      if (t.type === 'NOT') { p++; return { type: 'not', a: parseUnary() }; }
      return parsePostfix();
    }

    function parsePostfix() {
      let node = parsePrimary();
      while (peek() && peek().type === 'PRIME') { p++; node = { type: 'not', a: node }; }
      return node;
    }

    function parsePrimary() {
      const t = toks[p];
      if (!t) throw new ParseError('The expression ends too early. Something is missing after the last operator.', endPos);
      p++;
      if (t.type === 'VAR') return { type: 'var', name: t.name };
      if (t.type === 'CONST') return { type: 'const', value: t.value };
      if (t.type === 'LPAREN') {
        const inner = parseOr();
        const close = toks[p];
        if (!close || close.type !== 'RPAREN') {
          throw new ParseError("Missing closing parenthesis ')'.", close ? close.pos : endPos);
        }
        p++;
        return inner;
      }
      if (t.type === 'RPAREN') throw new ParseError("Unexpected ')'. There is no matching '('.", t.pos);
      if (t.type === 'PRIME') throw new ParseError("A ' (NOT) must come right after a variable or a closing parenthesis.", t.pos);
      throw new ParseError("Unexpected '" + t.text + "'. An operator needs a value on both sides.", t.pos);
    }

    const ast = parseOr();
    if (p < toks.length) {
      const t = toks[p];
      if (t.type === 'RPAREN') throw new ParseError("Unexpected ')'. There is no matching '('.", t.pos);
      throw new ParseError("Unexpected '" + t.text + "'.", t.pos);
    }
    return ast;
  }

  function evaluate(n, env) {
    switch (n.type) {
      case 'var': return env[n.name] ? 1 : 0;
      case 'const': return n.value;
      case 'not': return 1 - evaluate(n.a, env);
      case 'bin': return LL.evalGate(n.op, [evaluate(n.a, env), evaluate(n.b, env)]);
      default: throw new Error('Bad AST node');
    }
  }

  function variables(ast) {
    const set = new Set();
    (function walk(n) {
      if (n.type === 'var') set.add(n.name);
      else if (n.type === 'not') walk(n.a);
      else if (n.type === 'bin') { walk(n.a); walk(n.b); }
    })(ast);
    return Array.from(set).sort();
  }

  const SYMBOL = { AND: '·', OR: '+', XOR: '⊕', NAND: 'NAND', NOR: 'NOR', XNOR: 'XNOR' };

  /** Fully parenthesised text of the parsed tree, so students can see how precedence was applied. */
  function fullString(n, top) {
    if (top === undefined) top = true;
    switch (n.type) {
      case 'var': return n.name;
      case 'const': return String(n.value);
      case 'not': {
        const inner = n.a;
        if (inner.type === 'var' || inner.type === 'const') return fullString(inner, false) + "'";
        return '(' + fullString(inner, true) + ")'";
      }
      case 'bin': {
        const s = fullString(n.a, false) + ' ' + SYMBOL[n.op] + ' ' + fullString(n.b, false);
        return top ? s : '(' + s + ')';
      }
      default: return '?';
    }
  }

  function hasConst(n) {
    if (n.type === 'const') return true;
    if (n.type === 'not') return hasConst(n.a);
    if (n.type === 'bin') return hasConst(n.a) || hasConst(n.b);
    return false;
  }

  /** Rows of the truth table for `vars` (array of names, first = most significant). */
  function truthTable(ast, vars) {
    const n = vars.length;
    const rows = [];
    for (let i = 0; i < (1 << n); i++) {
      const bits = LL.bitsOf(i, n);
      const env = {};
      vars.forEach((v, k) => { env[v] = bits[k]; });
      rows.push({ index: i, bits, out: evaluate(ast, env) });
    }
    return rows;
  }

  LL.parser = { parse, tokenize, evaluate, variables, fullString, hasConst, truthTable, ParseError };

  if (typeof module !== 'undefined' && module.exports) module.exports = LL.parser;
})(typeof window !== 'undefined' ? window : globalThis);
