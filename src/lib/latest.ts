/**
 * The latest of a series of requests, like "Find similar" while its slider is dragged: answers to earlier or cancelled
 * requests are dropped, and `again()` asks the current one once more, at most once per `gap` ms.
 */
export function latestRequest<A>(gap: number) {
  let token = 0;
  let current: A | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    /** Starts a request; the returned check stays true until a newer request starts or this one is cancelled. */
    start(args: A): () => boolean {
      current = args;
      const t = ++token;
      return () => t === token;
    },
    cancel() {
      token++;
      current = null;
    },
    /** Calls `run` with the latest request's arguments within `gap` ms, unless it has been cancelled by then. */
    again(run: (args: A) => void) {
      if (timer || current === null) return;
      timer = setTimeout(() => {
        timer = null;
        if (current !== null) run(current);
      }, gap);
    },
  };
}
