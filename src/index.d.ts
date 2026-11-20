export interface EngineOptions {
  threads?: number;
  hashMb?: number;
  startupTimeoutMs?: number;
}

type SearchLimit =
  | { depth?: number; nodes?: never; movetimeMs?: never }
  | { depth?: never; nodes: number; movetimeMs?: never }
  | { depth?: never; nodes?: never; movetimeMs: number };

export type AnalysisOptions = SearchLimit & {
  fen?: string;
  moves?: readonly string[];
  multiPv?: number;
  timeoutMs?: number;
};

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
  lines: AnalysisLine[];
}

export interface Pikafish {
  readonly name: string;
  analyze(options?: AnalysisOptions): Promise<AnalysisResult>;
  close(): Promise<void>;
}

export function createEngine(options?: EngineOptions): Promise<Pikafish>;
