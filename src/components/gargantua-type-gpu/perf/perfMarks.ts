// May-the-fourth equivalent of components/scratch-2d/PerfomanceMetricsPanel — kept
// separate because that one is engine-specific and not generally reusable.

declare const __DEV__: boolean;

interface Sample {
  count: number;
  min: number;
  max: number;
  sum: number;
  values: number[];
}

interface Perf {
  start(label: string): void;
  end(label: string): void;
  measure<T>(label: string, fn: () => T): T;
  measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T>;
  log(): void;
  reset(): void;
}

const RING_CAP = 1000;

function createRealPerf(): Perf {
  const samples = new Map<string, Sample>();
  const pending = new Map<string, number>();

  const record = (label: string, dur: number) => {
    let s = samples.get(label);
    if (!s) {
      s = { count: 0, min: Infinity, max: -Infinity, sum: 0, values: [] };
      samples.set(label, s);
    }
    s.count++;
    s.sum += dur;
    if (dur < s.min) s.min = dur;
    if (dur > s.max) s.max = dur;
    if (s.values.length >= RING_CAP) s.values.shift();
    s.values.push(dur);
  };

  const percentile = (sorted: number[], p: number) => {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx];
  };

  const fmt = (n: number) => n.toFixed(2);

  return {
    start(label) {
      pending.set(label, performance.now());
    },
    end(label) {
      const t0 = pending.get(label);
      if (t0 === undefined) return;
      pending.delete(label);
      record(label, performance.now() - t0);
    },
    measure(label, fn) {
      const t0 = performance.now();
      try {
        return fn();
      } finally {
        record(label, performance.now() - t0);
      }
    },
    async measureAsync(label, fn) {
      const t0 = performance.now();
      try {
        return await fn();
      } finally {
        record(label, performance.now() - t0);
      }
    },
    log() {
      const labels = [...samples.keys()].sort();
      if (labels.length === 0) {
        console.log("[perf] no samples");
        return;
      }
      const lines = labels.map((label) => {
        const s = samples.get(label)!;
        const sorted = [...s.values].sort((a, b) => a - b);
        const avg = s.sum / s.count;
        const p50 = percentile(sorted, 50);
        const p95 = percentile(sorted, 95);
        return `[${label}] n=${s.count}  avg=${fmt(avg)}ms  p50=${fmt(p50)}  p95=${fmt(p95)}  min=${fmt(s.min)}  max=${fmt(s.max)}`;
      });
      console.log("\n" + lines.join("\n"));
    },
    reset() {
      samples.clear();
      pending.clear();
    },
  };
}

const noop = () => {};
const noopMeasure = <T,>(_l: string, fn: () => T) => fn();
const noopMeasureAsync = <T,>(_l: string, fn: () => Promise<T>) => fn();

export const perf: Perf = __DEV__
  ? createRealPerf()
  : {
      start: noop,
      end: noop,
      measure: noopMeasure,
      measureAsync: noopMeasureAsync,
      log: noop,
      reset: noop,
    };
