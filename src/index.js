const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { createReadStream } = require('node:fs');
const { access } = require('node:fs/promises');
const { join } = require('node:path');
const { createInterface } = require('node:readline');

const SUPPORTED_TARGETS = new Set([
  'linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64', 'win32-x64',
]);
const VENDOR_DIR = join(__dirname, '..', 'vendor');
const MOVE = /^[a-i][0-9][a-i][0-9]$/;

function integer(name, value, max) {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new RangeError(`${name} must be an integer from 1 to ${max}`);
  }
  return value;
}

function validateMoves(name, moves) {
  if (!Array.isArray(moves) || moves.some(move => typeof move !== 'string' || move.length !== 4 || !MOVE.test(move))) {
    throw new TypeError(`${name} must be an array of Xiangqi coordinates, such as h2e2`);
  }
}

function positionCommand(fen, moves) {
  validateMoves('moves', moves);

  let position = 'position startpos';
  if (fen !== undefined) {
    const match = typeof fen === 'string'
      && /^([rnbakcpRNBAKCP1-9/]+) [wb] - - [0-9]+ [1-9][0-9]*$/.exec(fen);
    const ranks = match && match[0] === fen && match[1].split('/');
    if (!ranks || ranks.length !== 10 || ranks.some(rank => {
      return [...rank].reduce((width, piece) => width + (Number(piece) || 1), 0) !== 9;
    })) {
      throw new TypeError('fen must be a six-field Pikafish Xiangqi FEN');
    }
    position = `position fen ${fen}`;
  }

  return moves.length ? `${position} moves ${moves.join(' ')}` : position;
}

function searchCommand({ depth, nodes, movetimeMs, searchMoves = [] }) {
  validateMoves('searchMoves', searchMoves);
  if (movetimeMs !== undefined && (depth !== undefined || nodes !== undefined)) {
    throw new TypeError('Use movetimeMs on its own, or combine depth and nodes');
  }
  const command = ['go'];
  if (depth !== undefined) command.push('depth', integer('depth', depth, 128));
  if (nodes !== undefined) command.push('nodes', integer('nodes', nodes, Number.MAX_SAFE_INTEGER));
  if (movetimeMs !== undefined) command.push('movetime', integer('movetimeMs', movetimeMs, 3_600_000));
  if (command.length === 1) command.push('depth', 12);
  if (searchMoves.length) command.push('searchmoves', ...searchMoves);
  return command.join(' ');
}

function searchInfo(line) {
  const match = /^info depth (\d+)(?: seldepth (\d+) multipv (\d+))? score (cp|mate) (-?\d+)(?: (lowerbound|upperbound))?(?: |$)/.exec(line);
  if (!match) return;

  const [, depth, selDepth, multiPv, type, value, bound] = match;
  const pv = / pv (.+)$/.exec(line);
  const info = { rank: Number(multiPv ?? 1), depth: Number(depth), score: { type, value: Number(value) }, pv: [] };
  if (bound) info.score.bound = bound;
  if (selDepth) info.selDepth = Number(selDepth);
  for (const [field, key] of [['nodes', 'nodes'], ['nps', 'nps'], ['time', 'timeMs']]) {
    const count = new RegExp(` ${field} (\\d+)`).exec(pv ? line.slice(0, pv.index) : line);
    if (count) info[key] = Number(count[1]);
  }
  if (pv) info.pv = pv[1].trim().split(/ +/);
  return info;
}

class EngineSession {
  #child;
  #exit;
  #pending;
  #closing = false;
  #diagnostics = '';
  #failure;

  constructor(binary) {
    this.#child = spawn(binary, { cwd: VENDOR_DIR, windowsHide: true });
    this.#exit = new Promise(resolve => {
      this.#child.once('close', (code, signal) => {
        this.#closing = true;
        this.#failure ??= new Error(
          `Pikafish exited (${signal ?? code})${this.#diagnostics ? `: ${this.#diagnostics.trim()}` : ''}`,
        );
        this.#pending?.finish(this.#failure);
        resolve();
      });
    });
    this.#child.on('error', error => { this.#failure = error; });
    this.#child.stdin.on('error', error => {
      this.#failure ??= error;
      this.#child.kill('SIGKILL');
    });
    this.#child.stderr.setEncoding('utf8').on('data', chunk => this.#record(chunk));

    createInterface({ input: this.#child.stdout, crlfDelay: Infinity }).on('line', line => {
      if (line.startsWith('info string ') && /(?:ERROR|failed|could not)/i.test(line)) {
        this.#record(`${line}\n`);
      }
      const pending = this.#pending;
      if (pending) {
        const result = pending.onLine(line.trimEnd());
        if (result !== undefined) pending.finish(null, result);
      }
    });
  }

  #record(text) {
    this.#diagnostics = (this.#diagnostics + text).slice(-4000);
  }

  exchange(commands, onLine, timeoutMs) {
    if (this.#closing) return Promise.reject(this.#failure ?? new Error('Pikafish is closed'));
    if (this.#pending) return Promise.reject(new Error('Pikafish is already analyzing a position'));

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#closing = true;
        this.#failure = new Error(`Pikafish timed out after ${timeoutMs} ms`);
        this.#pending.finish(this.#failure);
        this.#child.kill('SIGKILL');
      }, timeoutMs);
      this.#pending = {
        onLine,
        finish: (error, result) => {
          clearTimeout(timer);
          this.#pending = undefined;
          if (error) reject(error);
          else resolve(result);
        },
      };
      this.#child.stdin.write(`${commands.join('\n')}\n`);
    });
  }

  close() {
    if (!this.#closing) {
      this.#closing = true;
      this.#pending?.finish(new Error('Pikafish was closed'));
      const timer = setTimeout(() => this.#child.kill('SIGKILL'), 1000);
      this.#exit.then(() => clearTimeout(timer));
      this.#child.stdin.end('quit\n');
    }
    return this.#exit;
  }
}

async function engineFiles() {
  const target = `${process.platform}-${process.arch}`;
  if (!SUPPORTED_TARGETS.has(target)) throw new Error(`Pikafish does not support ${target}`);
  const binary = join(VENDOR_DIR, target, process.platform === 'win32' ? 'pikafish.exe' : 'pikafish');
  const network = join(VENDOR_DIR, 'pikafish.nnue');
  await Promise.all([access(binary), access(network)]);
  return { binary, network };
}

async function runUci(args) {
  const { binary } = await engineFiles();
  const child = spawn(binary, args, { cwd: VENDOR_DIR, stdio: 'inherit', windowsHide: true });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (signal) reject(new Error(`Pikafish received ${signal}`));
      else resolve(code);
    });
  });
}

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function engineHashes() {
  const { binary, network } = await engineFiles();
  const [binary_sha256, nnue_sha256] = await Promise.all([sha256(binary), sha256(network)]);
  return { binary_sha256, nnue_sha256 };
}

async function createEngine({ threads = 1, hashMb = 16, startupTimeoutMs = 15_000 } = {}) {
  integer('threads', threads, 128);
  integer('hashMb', hashMb, 4096);
  integer('startupTimeoutMs', startupTimeoutMs, 2_147_483_647);
  const { binary } = await engineFiles();

  const session = new EngineSession(binary);
  let name = 'Pikafish';
  try {
    await session.exchange(['uci'], line => {
      if (line.startsWith('id name ')) name = line.slice(8);
      if (line === 'uciok') return true;
    }, startupTimeoutMs);
    await session.exchange([
      `setoption name Threads value ${threads}`,
      `setoption name Hash value ${hashMb}`,
      'isready',
    ], line => line === 'readyok' ? true : undefined, startupTimeoutMs);
  } catch (error) {
    await session.close();
    throw error;
  }

  return {
    name,
    async inspect({ fen, moves = [], timeoutMs = 30_000 } = {}) {
      integer('timeoutMs', timeoutMs, 2_147_483_647);
      const position = positionCommand(fen, moves);
      const state = { fen: '', checkers: [], legal: [] };
      let total;
      return session.exchange([position, 'd', 'go perft 1', 'isready'], line => {
        if (line.startsWith('Fen: ')) state.fen = line.slice(5);
        if (line.startsWith('Checkers:')) state.checkers = line.slice(9).trim().split(/\s+/).filter(Boolean).sort();
        const legalMove = /^([a-i][0-9][a-i][0-9]): 1$/.exec(line);
        if (legalMove) state.legal.push(legalMove[1]);
        if (line.startsWith('Nodes searched: ')) total = Number(line.slice(16));
        if (line === 'readyok') return true;
      }, timeoutMs).then(() => {
        if (!state.fen || state.legal.length !== total) throw new Error('Incomplete Pikafish position report');
        state.legal.sort();
        return state;
      });
    },
    async analyze({ fen, moves = [], multiPv = 1, timeoutMs = 30_000, ...limits } = {}) {
      integer('multiPv', multiPv, 128);
      integer('timeoutMs', timeoutMs, 2_147_483_647);
      const position = positionCommand(fen, moves);
      const search = searchCommand(limits);
      const lines = new Map();
      const iterations = new Map();
      let complete = [];

      return session.exchange([
        'ucinewgame',
        `setoption name MultiPV value ${multiPv}`,
        position,
        search,
      ], line => {
        const best = /^bestmove (\S+)(?: ponder (\S+))?$/.exec(line);
        if (best) {
          const [, move, ponder] = best;
          return {
            bestMove: MOVE.test(move) ? move : null,
            ponder: MOVE.test(ponder ?? '') ? ponder : null,
            completeDepth: complete[0]?.depth ?? null,
            lines: complete.length ? complete : [...lines.values()].sort((a, b) => a.rank - b.rank),
          };
        }
        const info = searchInfo(line);
        if (!info) return;
        lines.set(info.rank, info);
        if (info.score.bound || !info.pv.length) return;
        const key = `${info.depth}:${info.nodes}`;
        const iteration = iterations.get(key) ?? new Map();
        iteration.set(info.rank, info);
        iterations.set(key, iteration);
        if (iteration.size === multiPv && info.depth >= (complete[0]?.depth ?? 0)) {
          const ranked = [...iteration.values()].sort((a, b) => a.rank - b.rank);
          if (new Set(ranked.map(entry => entry.pv[0])).size === multiPv) complete = ranked;
        }
      }, timeoutMs);
    },
    close: () => session.close(),
  };
}

exports.createEngine = createEngine;
exports.runUci = runUci;
exports.engineHashes = engineHashes;
