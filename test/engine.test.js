const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const { test } = require('node:test');
const { createEngine } = require('../src');

const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';
const MOVE = /^[a-i][0-9][a-i][0-9]$/;

test('searches both the starting position and an explicit FEN with move history', async () => {
  const engine = await createEngine({ hashMb: 16 });
  try {
    assert.match(engine.name, /^Pikafish /);
    const start = await engine.analyze({ depth: 5 });
    assert.match(start.bestMove, MOVE);
    assert.equal(start.lines[0].depth, 5);
    assert.equal(start.lines[0].pv[0], start.bestMove);
    assert.equal(start.lines[0].score.type, 'cp');

    const position = await engine.analyze({ fen: START_FEN, moves: ['h2e2'], depth: 5, multiPv: 3 });
    assert.match(position.bestMove, MOVE);
    assert.equal(position.completeDepth, 5);
    assert.deepEqual(position.lines.map(line => line.rank), [1, 2, 3]);
    assert.equal(position.lines[0].pv[0], position.bestMove);
    assert.equal(new Set(position.lines.map(line => line.pv[0])).size, 3);

    await assert.rejects(engine.analyze({ fen: `${START_FEN}\n` }), /six-field/);
    await assert.rejects(engine.analyze({ moves: ['h2e2\n'] }), /coordinates/);
    await assert.rejects(engine.analyze({ nodes: 100, movetimeMs: 20 }), /on its own/);
    assert.equal((await engine.analyze({ depth: 5, nodes: 1000, searchMoves: ['h2e2'] })).bestMove, 'h2e2');
    assert.match((await engine.analyze({ nodes: 1000 })).bestMove, MOVE);
    assert.match((await engine.analyze({ movetimeMs: 100 })).bestMove, MOVE);
  } finally {
    await engine.close();
  }
  await assert.rejects(engine.analyze(), /closed|exited/);
});

test('the terminal commands accept FEN and pass through the native protocol', () => {
  const cli = (...args) => spawnSync(process.execPath, [join(__dirname, '../bin/pikafish-node.js'), ...args], {
    input: `${START_FEN}\n`, encoding: 'utf8', timeout: 30_000,
  });
  const search = cli('search', '--depth', '5', '--nodes', '1000', '--searchmove', 'h2e2', '--json', START_FEN);
  assert.equal(search.status, 0, search.stderr);
  assert.equal(JSON.parse(search.stdout).bestMove, 'h2e2');

  const inspect = cli('inspect', '--json');
  assert.equal(inspect.status, 0, inspect.stderr);
  const state = JSON.parse(inspect.stdout);
  assert.deepEqual(state.checkers, []);
  assert.equal(state.legal.length, 44);
  assert.ok(state.legal.includes('h2e2'));

  const uci = cli('uci', 'compiler');
  assert.equal(uci.status, 0, uci.stderr);
  assert.match(uci.stdout, /compiler|compiled/i);

  const info = cli('info');
  assert.equal(info.status, 0, info.stderr);
  assert.match(JSON.parse(info.stdout).nnue_sha256, /^[0-9a-f]{64}$/);
});

test('rejects concurrent searches and closes a timed-out engine', async () => {
  const engine = await createEngine();
  try {
    const search = engine.analyze({ depth: 128, timeoutMs: 20 });
    await assert.rejects(engine.analyze({ depth: 2 }), /already analyzing/);
    await assert.rejects(search, /timed out/);
    await assert.rejects(engine.analyze(), /timed out/);
  } finally {
    await engine.close();
  }
});
