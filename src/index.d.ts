export interface EngineOptions {
  threads?: number;
  hashMb?: number;
  startupTimeoutMs?: number;
}

type SearchLimit =
  | { depth?: number; nodes?: number; movetimeMs?: never }
  | { depth?: never; nodes?: never; movetimeMs: number };

export interface PositionOptions {
  fen?: string;
  moves?: readonly string[];
  timeoutMs?: number;
}

export type AnalysisOptions = SearchLimit & PositionOptions & {
  multiPv?: number;
  searchMoves?: readonly string[];
};

export interface PositionState {
  fen: string;
  checkers: string[];
  legal: string[];
}

export interface AnalysisLine {
  rank: number;
  depth: number;
  selDepth?: number;
  score: { type: 'cp' | 'mate'; value: number; bound?: 'lowerbound' | 'upperbound' };
  pv: string[];
  nodes?: number;
  nps?: number;
  timeMs?: number;
}

export interface AnalysisResult {
  bestMove: string | null;
  ponder: string | null;
  completeDepth: number | null;
  lines: AnalysisLine[];
}

export interface Pikafish {
  readonly name: string;
  inspect(options?: PositionOptions): Promise<PositionState>;
  analyze(options?: AnalysisOptions): Promise<AnalysisResult>;
  close(): Promise<void>;
}

export function createEngine(options?: EngineOptions): Promise<Pikafish>;
export function runUci(args: readonly string[]): Promise<number>;
export function engineHashes(): Promise<{ binary_sha256: string; nnue_sha256: string }>;
