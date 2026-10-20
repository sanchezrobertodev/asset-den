// A request queue for work tied to what's on screen (thumbnails).
//
// A fast scroll mounts and unmounts thousands of cards. Starting each card's work right away queued it for every card
// scrolled past, and the cards where the scroll stopped waited behind it. Here at most `maxActive` jobs run at once,
// the newest waiting request runs first (what just appeared on screen), and a request withdrawn before its turn never
// runs. Results are cached by key for the session.

interface Job<T> {
  listeners: Set<(value: T) => void>;
  /** Latest position in the stack; older stack entries for the same job are skipped. */
  seq: number;
}

export function createScheduler<A, T>(run: (arg: A) => Promise<T>, maxActive: number) {
  const done = new Map<string, T>();
  const waiting = new Map<string, Job<T> & { arg: A }>();
  const running = new Map<string, Job<T>>();
  // (key, seq) pairs; the top is the most recent request. Stale entries are skipped when popped, so requesting
  // and withdrawing stay O(1) however many cards a scroll passes.
  const stack: { key: string; seq: number }[] = [];
  let seq = 0;

  const pump = () => {
    while (running.size < maxActive && stack.length) {
      const { key, seq: s } = stack.pop()!;
      const job = waiting.get(key);
      if (!job || job.seq !== s) continue;
      waiting.delete(key);
      running.set(key, job);
      run(job.arg).then((value) => {
        running.delete(key);
        done.set(key, value);
        job.listeners.forEach((l) => l(value));
        pump();
      });
    }
  };

  /** Asks for the value under `key`; `onReady` gets it. Returns a function that withdraws the request. */
  const request = (key: string, arg: A, onReady: (value: T) => void): (() => void) => {
    if (done.has(key)) {
      onReady(done.get(key)!);
      return () => {};
    }
    const live = running.get(key);
    if (live) {
      live.listeners.add(onReady);
      return () => live.listeners.delete(onReady);
    }
    const job = waiting.get(key) ?? { arg, listeners: new Set<(value: T) => void>(), seq: 0 };
    job.listeners.add(onReady);
    job.seq = ++seq;
    waiting.set(key, job);
    stack.push({ key, seq: job.seq });
    pump();
    return () => {
      job.listeners.delete(onReady);
      if (!job.listeners.size && waiting.get(key) === job) waiting.delete(key);
    };
  };

  return { request, stats: () => ({ waiting: waiting.size, running: running.size, done: done.size }) };
}
