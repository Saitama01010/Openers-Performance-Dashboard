"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  chooseRexPlacement,
  type RexPlacement,
  type RexPlacementRect,
} from "@/components/dashboard/rex-placement";

import styles from "./rex-mascot.module.css";

const REX_STORAGE_KEY = "openers.rex.enabled";
const REX_PREFERENCE_EVENT = "openers:rex-preference";
const DESKTOP_REX_SIZE = 64;
const MOBILE_REX_SIZE = 48;
const VIEWPORT_PADDING = 12;
const SEAT_PADDING = 14;
const SMALL_VIEWPORT_WIDTH = 360;
const SMALL_VIEWPORT_HEIGHT = 420;

type RexMode = "idle" | "seated" | "walking";

let fallbackPreference = true;

function readStoredPreference() {
  try {
    const stored = window.localStorage.getItem(REX_STORAGE_KEY);
    if (stored === null || stored === "true") return true;
    if (stored === "false") return false;
  } catch {
    // Storage can be unavailable in hardened or private browser contexts.
  }

  return fallbackPreference;
}

function subscribeToPreference(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === REX_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(REX_PREFERENCE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(REX_PREFERENCE_EVENT, onChange);
  };
}

const subscribeToHydration = () => () => undefined;
const getHydratedSnapshot = () => true;
const getServerHydratedSnapshot = () => false;
const getServerPreferenceSnapshot = () => true;

function useRexPreference() {
  const enabled = useSyncExternalStore(
    subscribeToPreference,
    readStoredPreference,
    getServerPreferenceSnapshot,
  );
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydratedSnapshot,
  );

  const toggle = useCallback(() => {
    const next = !readStoredPreference();
    fallbackPreference = next;
    try {
      window.localStorage.setItem(REX_STORAGE_KEY, String(next));
    } catch {
      // The in-memory preference still works when persistence is unavailable.
    }
    window.dispatchEvent(new Event(REX_PREFERENCE_EVENT));
  }, []);

  return { enabled, hydrated, toggle };
}

export function RexToggle() {
  const { enabled, hydrated, toggle } = useRexPreference();
  const label = enabled ? "Disable Rex" : "Enable Rex";

  return (
    <button
      aria-label={label}
      aria-pressed={enabled}
      className={`${styles.toggle} ui-button ui-button--secondary ui-button--compact`}
      data-rex-control
      disabled={!hydrated}
      onClick={toggle}
      title={label}
      type="button"
    >
      <span>{label}</span>
    </button>
  );
}

function isVisibleElement(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function toPlacementRect(element: HTMLElement): RexPlacementRect {
  const rect = element.getBoundingClientRect();
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

function obstacleRects() {
  const selector = [
    "button",
    "a",
    "input",
    "select",
    "textarea",
    "[role='button']",
    "[role='link']",
    "h1",
    "h2",
    "h3",
    "p",
    "nav",
    "table",
    "[class*='card']",
    "[class*='panel']",
    "[class*='toolbar']",
    "[data-rex-protected]",
  ].join(",");

  return Array.from(document.querySelectorAll<HTMLElement>(selector))
    .filter((element) => !element.closest("[data-rex-control]"))
    .filter(isVisibleElement)
    .map(toPlacementRect);
}

function rexSize() {
  return window.innerWidth <= 672 ? MOBILE_REX_SIZE : DESKTOP_REX_SIZE;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function findTopPlacement(): RexPlacement {
  const size = rexSize();
  const header = document.querySelector<HTMLElement>(".dashboard-topbar");
  const content = document.querySelector<HTMLElement>("#dashboard-content");
  const headerRect = header?.getBoundingClientRect();
  const contentRect = content?.getBoundingClientRect();
  const minimumLeft = Math.max(
    VIEWPORT_PADDING,
    (contentRect?.left ?? VIEWPORT_PADDING) + SEAT_PADDING,
  );
  const maximumLeft = Math.min(
    window.innerWidth - size - VIEWPORT_PADDING,
    (contentRect?.right ?? window.innerWidth) - size - SEAT_PADDING,
  );
  const top = Math.max(
    VIEWPORT_PADDING,
    (headerRect?.bottom ?? 0) + SEAT_PADDING,
  );
  const center = clamp(
    minimumLeft + (maximumLeft - minimumLeft) / 2,
    minimumLeft,
    maximumLeft,
  );
  const candidates = [
    { left: minimumLeft, top },
    { left: center, top },
    { left: maximumLeft, top },
  ];

  return (
    chooseRexPlacement(candidates, obstacleRects(), size, SEAT_PADDING) ??
    { left: center, top }
  );
}

function fixedBottomInset() {
  let inset = VIEWPORT_PADDING;
  const candidates = document.querySelectorAll<HTMLElement>(
    "[data-fixed-footer], [data-bottom-navigation], footer",
  );

  for (const element of candidates) {
    if (!isVisibleElement(element)) continue;
    const style = window.getComputedStyle(element);
    if (style.position !== "fixed" && style.position !== "sticky") continue;
    const rect = element.getBoundingClientRect();
    if (rect.bottom < window.innerHeight - 2) continue;
    inset = Math.max(inset, window.innerHeight - rect.top + VIEWPORT_PADDING);
  }

  return inset;
}

export function RexMascot() {
  const { enabled, hydrated } = useRexPreference();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const currentXRef = useRef(VIEWPORT_PADDING);
  const facingRef = useRef<1 | -1>(1);
  const idleCountRef = useRef(0);
  const seatAnimationRef = useRef<Animation | null>(null);
  const seatOriginRef = useRef<DOMRect | null>(null);
  const [mode, setMode] = useState<RexMode>("walking");
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [smallViewport, setSmallViewport] = useState(false);
  const staticMascot = reducedMotion || smallViewport;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreferences = () => {
      setReducedMotion(media.matches);
      setSmallViewport(
        window.innerWidth < SMALL_VIEWPORT_WIDTH ||
          window.innerHeight < SMALL_VIEWPORT_HEIGHT,
      );
    };

    updatePreferences();
    media.addEventListener("change", updatePreferences);
    return () => media.removeEventListener("change", updatePreferences);
  }, []);

  const placeAtTop = useCallback(() => {
    const button = buttonRef.current;
    const shell = document.querySelector<HTMLElement>(".dashboard-shell");
    if (!button || !shell) return;

    const placement = findTopPlacement();
    const shellRect = shell.getBoundingClientRect();
    seatAnimationRef.current?.cancel();
    button.style.bottom = "auto";
    button.style.left = `${placement.left - shellRect.left}px`;
    button.style.top = `${placement.top - shellRect.top}px`;
    button.style.transform = "translate3d(0, 0, 0)";

    const origin = seatOriginRef.current;
    seatOriginRef.current = null;
    if (!origin || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const target = button.getBoundingClientRect();
    seatAnimationRef.current = button.animate(
      [
        {
          transform: `translate3d(${origin.left - target.left}px, ${origin.top - target.top}px, 0)`,
        },
        { transform: "translate3d(0, 0, 0)" },
      ],
      {
        duration: 420,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    );
  }, []);

  useEffect(
    () => () => {
      seatAnimationRef.current?.cancel();
    },
    [],
  );

  useEffect(() => {
    if (!hydrated || !enabled) return;

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const onLayoutChange = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        setSmallViewport(
          window.innerWidth < SMALL_VIEWPORT_WIDTH ||
            window.innerHeight < SMALL_VIEWPORT_HEIGHT,
        );
        setLayoutEpoch((current) => current + 1);
      }, 180);
    };
    const observer = new ResizeObserver(onLayoutChange);
    const header = document.querySelector<HTMLElement>(".dashboard-topbar");
    const content = document.querySelector<HTMLElement>("#dashboard-content");
    if (header) observer.observe(header);
    if (content) observer.observe(content);
    window.addEventListener("resize", onLayoutChange, { passive: true });

    return () => {
      clearTimeout(debounceTimer);
      observer.disconnect();
      window.removeEventListener("resize", onLayoutChange);
    };
  }, [enabled, hydrated]);

  useEffect(() => {
    const button = buttonRef.current;
    if (!button || !hydrated || !enabled) return;

    if (mode === "seated") {
      placeAtTop();
      return;
    }

    const size = rexSize();
    const minimumX = VIEWPORT_PADDING;
    const maximumX = Math.max(
      minimumX,
      window.innerWidth - size - VIEWPORT_PADDING,
    );
    currentXRef.current = clamp(currentXRef.current, minimumX, maximumX);
    button.style.bottom = `${fixedBottomInset()}px`;
    button.style.left = "0px";
    button.style.top = "auto";

    if (staticMascot) {
      button.style.transform = `translate3d(${currentXRef.current}px, 0, 0)`;
      return;
    }

    if (mode === "idle") {
      const idleDuration = 1800 + (idleCountRef.current % 3) * 700;
      idleCountRef.current += 1;
      const idleTimer = window.setTimeout(
        () => setMode("walking"),
        idleDuration,
      );
      return () => window.clearTimeout(idleTimer);
    }

    let targetX = facingRef.current === 1 ? maximumX : minimumX;
    if (Math.abs(targetX - currentXRef.current) < 2) {
      facingRef.current = facingRef.current === 1 ? -1 : 1;
      targetX = facingRef.current === 1 ? maximumX : minimumX;
    }
    button.style.setProperty("--rex-facing", String(facingRef.current));
    const distance = Math.abs(targetX - currentXRef.current);
    const duration = clamp((distance / 42) * 1000, 7000, 42000);
    let finished = false;
    const animation = button.animate(
      [
        { transform: `translate3d(${currentXRef.current}px, 0, 0)` },
        { transform: `translate3d(${targetX}px, 0, 0)` },
      ],
      { duration, easing: "linear", fill: "forwards" },
    );
    const onVisibilityChange = () => {
      if (document.hidden) animation.pause();
      else animation.play();
    };
    if (document.hidden) animation.pause();
    document.addEventListener("visibilitychange", onVisibilityChange);
    animation.onfinish = () => {
      finished = true;
      currentXRef.current = targetX;
      facingRef.current = facingRef.current === 1 ? -1 : 1;
      setMode("idle");
    };

    return () => {
      if (!finished) {
        const rect = button.getBoundingClientRect();
        currentXRef.current = clamp(rect.left, minimumX, maximumX);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
      animation.cancel();
    };
  }, [enabled, hydrated, layoutEpoch, mode, placeAtTop, staticMascot]);

  if (!hydrated || !enabled) return null;

  const displayedMode = staticMascot && mode !== "seated" ? "static" : mode;
  const label =
    mode === "seated"
      ? "Return Rex to walking"
      : "Move Rex to a safe resting place";

  return (
    <button
      aria-label={label}
      className={`${styles.mascot} ${styles[displayedMode]}`}
      data-rex-control
      onClick={() => {
        if (mode === "seated") {
          setMode(staticMascot ? "idle" : "walking");
          return;
        }
        const origin = buttonRef.current?.getBoundingClientRect();
        if (origin) {
          currentXRef.current = origin.left;
          seatOriginRef.current = origin;
        }
        setMode("seated");
      }}
      ref={buttonRef}
      title={label}
      type="button"
    >
      <span aria-hidden="true" className={styles.sprite} />
    </button>
  );
}
