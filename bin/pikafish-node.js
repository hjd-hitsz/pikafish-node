#!/usr/bin/env node
const { createInterface } = require('node:readline');
const { parseArgs } = require('node:util');
const { createEngine, engineHashes, runUci } = require('../src');
const { version } = require('../package.json');

const HELP = `Usage: pikafish-node [search|inspect] [options] ["FEN"]
       pikafish-node uci [engine arguments]
       pikafish-node info

  search             Analyze a position (default command)
  inspect            Show the resulting FEN, checking pieces, and legal moves
  uci                Open a raw Pikafish terminal session
  info               Print engine name and SHA-256 values as JSON

Supply the FEN as a quoted argument, paste it at the prompt, or pipe it in.

Search limits (combine depth and nodes, or use movetime alone):
  --depth N          Search depth from 1 to 128 (default: 12)
  --nodes N          Search up to N nodes
  --movetime MS      Search for MS milliseconds

Options:
  --multipv N        Number of ranked lines (default: 1)
  --searchmove MOVE  Search this root move only (repeatable)
  --move MOVE        Apply a coordinate move, such as h2e2 (repeatable)
  --startpos         Use the standard opening position
  --threads N        Search threads (default: 1)
  --hash MIB         Hash table size in MiB (default: 16)
  --timeout MS       Search timeout in milliseconds (default: 30000)
  --json             Print the result as JSON
  -h, --help         Show this help
  -v, --version      Show the installed package version`;

async function readFen() {
  if (process.stdin.isTTY) process.stderr.write('FEN> ');
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (line.trim()) return line.trim();
    }
  } finally {
    lines.close();
  }
  throw new Error('Supply a six-field Pikafish Xiangqi FEN');
}

function number(value) {
  return value === undefined ? undefined : Number(value);
}

function printResult(engine, result, json) {
  if (json) {
    console.log(JSON.stringify({ engine, ...result }));
    return;
  }

  console.log(engine);
  console.log(`Best move  ${result.bestMove ?? 'none'}`);
  if (result.ponder) console.log(`Ponder     ${result.ponder}`);
  console.log(`Complete depth  ${result.completeDepth ?? 'none'}`);
  for (const { rank, depth, score, pv } of result.lines) {
    const bound = score.bound ? ` ${score.bound}` : '';
    const variation = pv.length ? `   ${pv.join(' ')}` : '';
    console.log(`${rank}. depth ${depth}   ${score.type} ${score.value}${bound}${variation}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === 'uci') {
    process.exitCode = await runUci(args.slice(1));
    return;
  }
  if (args[0] === 'info') {
    if (args.length !== 1) throw new Error('info takes no arguments');
    const hashes = await engineHashes();
    const engine = await createEngine();
    try {
      console.log(JSON.stringify({ name: engine.name, ...hashes }));
    } finally {
      await engine.close();
    }
    return;
  }
  const command = ['search', 'inspect'].includes(args[0]) ? args.shift() : 'search';
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      depth: { type: 'string' },
      nodes: { type: 'string' },
      movetime: { type: 'string' },
      multipv: { type: 'string' },
      searchmove: { type: 'string', multiple: true },
      move: { type: 'string', multiple: true },
      startpos: { type: 'boolean' },
      threads: { type: 'string' },
      hash: { type: 'string' },
      timeout: { type: 'string' },
      json: { type: 'boolean' },
    },
  });

  if (values.help) return console.log(HELP);
  if (values.version) return console.log(version);
  if (positionals.length > 1) throw new Error('Pass the full FEN as one quoted argument');
  if (values.startpos && positionals.length) throw new Error('Choose a FEN or --startpos');
  if (command === 'inspect' && ['depth', 'nodes', 'movetime', 'multipv', 'searchmove'].some(key => values[key] !== undefined)) {
    throw new Error('Search options apply to search, not inspect');
  }

  const fen = values.startpos ? undefined : positionals[0] ?? await readFen();
  const engine = await createEngine({ threads: number(values.threads), hashMb: number(values.hash) });
  try {
    const position = { fen, moves: values.move, timeoutMs: number(values.timeout) };
    if (command === 'inspect') {
      const state = await engine.inspect(position);
      if (values.json) console.log(JSON.stringify(state));
      else {
        console.log(`FEN          ${state.fen}`);
        console.log(`Checkers     ${state.checkers.join(' ') || 'none'}`);
        console.log(`Legal moves  ${state.legal.join(' ') || 'none'}`);
      }
      return;
    }
    const result = await engine.analyze({
      ...position,
      depth: number(values.depth),
      nodes: number(values.nodes),
      movetimeMs: number(values.movetime),
      multiPv: number(values.multipv),
      searchMoves: values.searchmove,
    });
    printResult(engine.name, result, values.json);
  } finally {
    await engine.close();
  }
}

main().catch(error => {
  console.error(`pikafish-node: ${error.message}`);
  process.exitCode = 1;
});
