// One shared IntersectionObserver that tells elements whether they're on screen (or within a short margin of it).
// Thumbnails use it so only cards you can see ask for work, also in lists that aren't virtualized (collections,
// duplicates, the filmstrip), where every card is mounted at once.

const MARGIN = "300px";
const listeners = new Map<Element, (visible: boolean) => void>();
let observer: IntersectionObserver | null = null;

/** Calls `onChange` when `el` comes near the screen or leaves it. Returns a function that stops watching. */
export function watchOnScreen(el: Element, onChange: (visible: boolean) => void): () => void {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) listeners.get(e.target)?.(e.isIntersecting);
    },
    { rootMargin: MARGIN },
  );
  listeners.set(el, onChange);
  observer.observe(el);
  return () => {
    observer?.unobserve(el);
    listeners.delete(el);
  };
}
