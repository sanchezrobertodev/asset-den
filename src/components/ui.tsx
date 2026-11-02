import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from "react";
import { kindLabel } from "../lib/format";
import type { Kind } from "../types";

type Variant = "accent" | "invert" | "outline" | "ghost" | "danger";

export function Button({
  variant = "outline",
  size = "md",
  className,
  children,
  ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      type="button"
      className={clsx(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-[9px] whitespace-nowrap transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "h-8 px-2.5",
        size === "md" && "h-[34px] px-3.5",
        size === "lg" && "h-[38px] px-4",
        variant === "accent" && "bg-accent font-semibold text-accent-fg hover:enabled:brightness-105",
        variant === "invert" && "bg-invert-bg font-semibold text-invert-fg hover:enabled:opacity-90",
        variant === "outline" && "border border-line-strong text-fg hover:enabled:bg-active",
        variant === "ghost" && "text-muted hover:enabled:text-fg",
        variant === "danger" && "border border-danger/50 text-danger hover:enabled:bg-danger/10",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  bordered,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; bordered?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-active hover:text-fg disabled:opacity-40",
        bordered && "border border-line-strong text-fg",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** The design's colored type label ("Images", "Audio"…). */
export function KindPill({ kind, className }: { kind: Kind; className?: string }) {
  return (
    <span data-kind={kind} className={clsx("k-pill rounded-md px-2 py-[3px] text-[11.5px] font-medium whitespace-nowrap", className)}>
      {kindLabel[kind]}
    </span>
  );
}

export function KindDot({ kind, className }: { kind: Kind; className?: string }) {
  return <span aria-hidden data-kind={kind} className={clsx("k-dot inline-block shrink-0 rounded-full", className ?? "size-[7px]")} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-x px-1.5 font-mono text-[11px] text-fg-2">{children}</kbd>;
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx("text-[11px] font-medium tracking-[.06em] text-faint uppercase", className)}>{children}</span>;
}

/** Two-or-more option toggle in a bordered pill, like the design's Grid / List switch. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex h-[30px] shrink-0 overflow-hidden rounded-lg border border-line-strong">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx("px-2.5 whitespace-nowrap -outline-offset-2", value === o.value ? "bg-active text-fg" : "text-muted hover:text-fg")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Puts keyboard focus on the asset list (or the page, in views without one), e.g. after the focused control goes away. */
export function focusAssets() {
  (document.querySelector<HTMLElement>("[data-assets]") ?? document.querySelector<HTMLElement>("main"))?.focus();
}

/** Keeps Tab and Shift+Tab inside a modal `box`, wrapping at either end. */
export function trapTab(e: { key: string; shiftKey: boolean; preventDefault: () => void }, box: HTMLElement | null) {
  if (e.key !== "Tab" || !box) return;
  const items = [...box.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, summary, [tabindex]")].filter(
    (el) => el.tabIndex >= 0 && !el.matches(":disabled") && el.getClientRects().length > 0,
  );
  const at = document.activeElement;
  // Focus on the dialog itself (full screen) counts as outside its controls.
  const inside = at !== box && box.contains(at);
  const [first, last] = [items[0], items[items.length - 1]];
  if (!first) e.preventDefault();
  else if (e.shiftKey && (at === first || !inside)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (at === last || !inside)) {
    e.preventDefault();
    first.focus();
  }
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Callers pass inline closures; reading the latest through a ref keeps focus from being reset on every render.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    // The marked default action wins over the first button in the page (the close ×).
    (panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current?.querySelector<HTMLElement>("button"))?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
      }
      trapTab(e, panel.current);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      prev?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-scrim p-4 pt-[14vh]" onMouseDown={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
        className={clsx(
          "flex max-h-[calc(86vh-2rem)] w-full flex-col overflow-hidden rounded-2xl border border-line-x bg-field shadow-[0_40px_100px_-20px_rgba(0,0,0,.7)]",
          wide ? "max-w-[640px]" : "max-w-md",
        )}
      >
        <div className="flex flex-none items-center justify-between gap-3 px-5 pt-4">
          <h2 id={titleId} className="text-[15px] font-semibold">
            {title}
          </h2>
          <IconButton label="Close" onClick={onClose} className="-mr-2">
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-3 text-fg-2">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-5 pt-1 pb-4">{footer}</div>}
      </div>
    </div>
  );
}
