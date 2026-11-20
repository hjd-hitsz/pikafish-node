# Pikafish for Node.js

Analyze Chinese chess (Xiangqi) positions locally with Pikafish. The npm package includes the native engine and its evaluation weights. Once installed, analysis works offline.

## Install

Use Node.js 22 or newer on Linux (x64 or ARM64, glibc 2.35 or newer), macOS (Intel or Apple Silicon), or Windows (x64).

```sh
npm install https://github.com/hjd-hitsz/pikafish-node/releases/latest/download/pikafish-node.tgz
```

For a fixed version, use the `pikafish-node.tgz` URL from the corresponding [GitHub release](https://github.com/hjd-hitsz/pikafish-node/releases).

## Analyze a position

```js
import { createEngine } from 'pikafish-node';

const engine = await createEngine({ threads: 2, hashMb: 64 });
try {
  const result = await engine.analyze({ moves: ['h2e2'], depth: 12, multiPv: 3 });
  console.log(result.bestMove);
  for (const { rank, score, pv } of result.lines) {
    console.log(rank, score.type, score.value, pv.join(' '));
  }
} finally {
  await engine.close();
}
```

In CommonJS, load the same function with `const { createEngine } = require('pikafish-node')`. TypeScript declarations are included.

## API

- `createEngine({ threads, hashMb, startupTimeoutMs })` starts an engine and returns it when ready. The defaults are one search thread, a 16 MiB hash, and 15 seconds per startup check. `engine.name` reports the engine version.
- `engine.analyze({ fen, moves, depth, nodes, movetimeMs, multiPv, timeoutMs })` searches a position. Omit `fen` to start from the initial board, or pass a six-field Pikafish FEN with `N` for horse, `B` for elephant, and `w` for Red or `b` for Black to move. `moves` applies moves in sequence from that board. Coordinates run from files `a`–`i` and ranks `0`–`9`, with `a0` at Red's lower-left corner.
- Choose one search limit from `depth` (1–128), `nodes`, and `movetimeMs`. The default is depth 12. `multiPv` requests 1–128 ranked lines and defaults to 1. `timeoutMs` defaults to 30 seconds. A timed-out search closes the engine. Create a new engine to continue.
- Each result contains `bestMove`, `ponder`, and ranked `lines`. `bestMove` is `null` when no legal move is available, and `ponder` is `null` when the engine has no predicted reply. Each line has `rank`, `depth`, `pv` (the suggested move sequence), and `score`. Scores retain Pikafish's `cp` or `mate` unit from the side to move. A `bound` marks a lower or upper bound when present. Search statistics are included when reported.
- `engine.close()` releases the engine. Await each search before starting the next on the same engine, or create independent engines for simultaneous searches.

## License

Use of the included NNUE weights is subject to Pikafish's license, which requires permission for commercial use. [License details and notices](THIRD_PARTY_NOTICES.md)
