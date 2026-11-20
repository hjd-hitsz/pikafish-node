# Pikafish CLI

Analyze Chinese chess (Xiangqi) positions from your terminal. Give `pikafish-node` a FEN to see the best move, its score, and the engine's suggested continuation. Everything needed to run offline is included in the install package.

## Install

Use Node.js 22 or newer on Linux (x64 or ARM64 with glibc 2.35 or newer), macOS 15 or newer (Intel or Apple Silicon), or Windows (x64).

```sh
npm install --global https://github.com/hjd-hitsz/pikafish-node/releases/latest/download/pikafish-node.tgz
```

For a project-local installation, omit `--global` and run the command as `npx pikafish-node`. For a fixed version, use the `pikafish-node.tgz` link from a specific [GitHub release](https://github.com/hjd-hitsz/pikafish-node/releases).

## Analyze a FEN

Pass the six-field FEN in quotes. This example asks for three candidate lines at depth 12.

```sh
pikafish-node --depth 12 --multipv 3 "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1"
```

Run `pikafish-node` without a FEN to paste one at the prompt. You can also pipe in a file containing a FEN.

```sh
cat position.fen | pikafish-node --movetime 1000 --json
```

In a Pikafish FEN, `N` denotes a horse, `B` an elephant, and `w` or `b` gives Red or Black the turn. Moves use files `a`–`i` and ranks `0`–`9`, with `a0` at Red's lower-left corner. For example, `h2e2` moves Red's right cannon to the center file. Use `--move h2e2` to apply it before the search. Repeat `--move` to apply more moves in order.

## Validate and compare positions

Use `inspect` to get the resulting FEN, the coordinates of checking pieces, and all legal moves. `--startpos` uses the initial board instead of a FEN.

```sh
pikafish-node inspect --startpos --move h2e2 --json
pikafish-node search --startpos --depth 20 --nodes 3000000 --multipv 2 --searchmove h2e2 --searchmove b2e2 --json
pikafish-node info
```

`--searchmove` limits the root moves the engine considers. Repeat it to compare several moves under the same search budget. `info` prints the engine version and SHA-256 of both the executable and its weights for recording how a result was produced.

## Search and output options

- Set `--depth N`, `--nodes N`, or both. Use `--movetime MS` by itself for a time limit. The default is depth 12.
- Use `--multipv N` to request up to 128 ranked lines. Each line shows its depth, score, and suggested move sequence. A `cp` or `mate` score is from the side to move.
- Use `--threads N` or `--hash MIB` to change the default of one thread and 16 MiB of hash. Set `--timeout MS` when a search needs longer than the default 30 seconds.
- Use `--json` for script-friendly output with `engine`, `bestMove`, `ponder`, `completeDepth`, and `lines`. When all requested lines have exact scores from the same completed iteration, `completeDepth` identifies that depth. Otherwise it is `null` and `lines` contains the last update for each available rank. `bestMove` is `null` when no legal move is available.
- Run `pikafish-node --help` to see all options.

## Use the full Pikafish command set

Run `pikafish-node uci` to open a native session. Enter commands one per line. This example inspects the position and lists the legal moves after `h2e2`.

```text
uci
isready
position startpos moves h2e2
d
go perft 1
quit
```

The same session accepts piped commands and works as a UCI executable for scripts. For searches, keep the session open until `bestmove` arrives. Use absolute paths for file options such as `EvalFile`. [Pikafish command reference](https://github.com/official-pikafish/Pikafish/wiki/UCI-&-Commands)

## License

The included NNUE weights require permission from Pikafish for commercial use. [License details and notices](THIRD_PARTY_NOTICES.md)
