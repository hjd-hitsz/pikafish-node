const assert = require('node:assert/strict');
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
    assert.deepEqual(position.lines.map(line => line.rank), [1, 2, 3]);
    assert.equal(position.lines[0].pv[0], position.bestMove);
    assert.equal(new Set(position.lines.map(line => line.pv[0])).size, 3);

    await assert.rejects(engine.analyze({ fen: `${START_FEN}\n` }), /six-field/);
    await assert.rejects(engine.analyze({ moves: ['h2e2\n'] }), /coordinates/);
    await assert.rejects(engine.analyze({ nodes: 100, depth: 2 }), /Choose one/);
    assert.match((await engine.analyze({ nodes: 1000 })).bestMove, MOVE);
    assert.match((await engine.analyze({ movetimeMs: 100 })).bestMove, MOVE);
  } finally {
    await engine.close();
  }
  await assert.rejects(engine.analyze(), /closed|exited/);
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
