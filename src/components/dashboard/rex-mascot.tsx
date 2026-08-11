"use client";

import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  chooseRexNavbarLane,
  chooseRexPlacement,
  createRexSeatCandidates,
  rexScaleForDirection,
  type RexDirection,
  type RexHorizontalBounds,
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
const PAGE_GEOMETRY_DEBOUNCE = 180;
const NAVBAR_REX_MIN_SIZE = 32;
const NAVBAR_REX_MAX_SIZE = 52;
const NAVBAR_OBSTACLE_PADDING = 8;

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

function obstacleRects(headerBottom: number) {
  const selector = [
    "button",
    "a",
    "input",
    "select",
    "textarea",
    "[role='button']",
    "[role='link']",
    "[role='tab']",
    "summary",
    "h1",
    "h2",
    "h3",
    "p",
    "nav",
    "table",
    "[class*='card']",
    "[class*='panel']",
    "[class*='toolbar']",
    "[class*='tabs']",
    "[class*='filter']",
    "[data-rex-protected]",
  ].join(",");
  const seen = new Set<string>();

  return Array.from(document.querySelectorAll<HTMLElement>(selector))
    .filter((element) => !element.closest("[data-rex-control]"))
    .filter(isVisibleElement)
    .map(toPlacementRect)
    .filter(
      (rect) =>
        rect.top + rect.height > headerBottom && rect.top < window.innerHeight,
    )
    .filter((rect) => {
      const key = [rect.left, rect.top, rect.width, rect.height]
        .map((value) => Math.round(value))
        .join(":");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function navbarObstacleRects(header: HTMLElement) {
  const selector = [
    ".dashboard-topbar__leading",
    ".dashboard-search",
    ".dashboard-topbar__actions",
    "button",
    "a",
    "input",
    "select",
    "textarea",
    "[role='button']",
    "[role='link']",
  ].join(",");
  const seen = new Set<string>();

  return Array.from(header.querySelectorAll<HTMLElement>(selector))
    .filter((element) => !element.closest("[data-rex-navbar-lane]"))
    .filter(isVisibleElement)
    .map(toPlacementRect)
    .filter((rect) => {
      const key = [rect.left, rect.top, rect.width, rect.height]
        .map((value) => Math.round(value))
        .join(":");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function rexSize() {
  return window.innerWidth <= 672 ? MOBILE_REX_SIZE : DESKTOP_REX_SIZE;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function rexTranslateX(left: number) {
  return `translate3d(${left}px, 0, 0)`;
}

function fixedBottomInset() {
  let inset = VIEWPORT_PADDING;
  const candidates = document.querySelectorAll<HTMLElement>(
    [
      "[data-fixed-footer]",
      "[data-bottom-navigation]",
      "footer",
      "[role='status']",
      "[role='alert']",
      "[class*='toast']",
      "[class*='pending']",
      "[class*='bottomNav']",
      "[class*='bottom-nav']",
    ].join(","),
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

type RexPageGeometry = {
  bottom: number;
  bounds: RexHorizontalBounds;
  headerBottom: number;
  obstacles: RexPlacementRect[];
};

function measurePageGeometry(): RexPageGeometry {
  const size = rexSize();
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const header = document.querySelector<HTMLElement>(".dashboard-topbar");
  const workspace = document.querySelector<HTMLElement>(".dashboard-workspace");
  const content = document.querySelector<HTMLElement>("#dashboard-content");
  const sidebar = document.querySelector<HTMLElement>(
    ".dashboard-sidebar--desktop",
  );
  const headerRect = header?.getBoundingClientRect();
  const workspaceRect = workspace?.getBoundingClientRect();
  const contentRect = content?.getBoundingClientRect();
  const sidebarRect = sidebar?.getBoundingClientRect();
  const sidebarVisible = sidebar ? isVisibleElement(sidebar) : false;
  const left = Math.max(
    VIEWPORT_PADDING,
    (workspaceRect?.left ?? 0) + VIEWPORT_PADDING,
    (contentRect?.left ?? 0) + VIEWPORT_PADDING,
    sidebarVisible ? (sidebarRect?.right ?? 0) + VIEWPORT_PADDING : 0,
  );
  const right = Math.max(
    left + size,
    Math.min(
      viewportWidth - VIEWPORT_PADDING,
      (workspaceRect?.right ?? viewportWidth) - VIEWPORT_PADDING,
      (contentRect?.right ?? viewportWidth) - VIEWPORT_PADDING,
    ),
  );
  const headerBottom = Math.max(
    VIEWPORT_PADDING,
    headerRect?.bottom ?? VIEWPORT_PADDING,
  );
  const bottom = Math.max(
    headerBottom + size + SEAT_PADDING,
    viewportHeight - fixedBottomInset(),
  );

  return {
    bottom,
    bounds: { left, right },
    headerBottom,
    obstacles: obstacleRects(headerBottom),
  };
}

type RexNavbarGeometry = {
  bounds: RexHorizontalBounds;
  height: number;
  obstacles: RexPlacementRect[];
  size: number;
  top: number;
};

function measureNavbarGeometry(): RexNavbarGeometry | null {
  const header = document.querySelector<HTMLElement>(".dashboard-topbar");
  const reservedLane = header?.querySelector<HTMLElement>(
    "[data-rex-navbar-lane]",
  );
  if (
    !header ||
    !reservedLane ||
    !isVisibleElement(header) ||
    !isVisibleElement(reservedLane)
  ) {
    return null;
  }

  const headerRect = header.getBoundingClientRect();
  const laneRect = reservedLane.getBoundingClientRect();
  const left = Math.max(headerRect.left, laneRect.left);
  const right = Math.min(headerRect.right, laneRect.right);
  const size = Math.floor(
    clamp(
      headerRect.height - NAVBAR_OBSTACLE_PADDING,
      NAVBAR_REX_MIN_SIZE,
      NAVBAR_REX_MAX_SIZE,
    ),
  );
  if (right - left < size) return null;

  return {
    bounds: { left, right },
    height: headerRect.height,
    obstacles: navbarObstacleRects(header),
    size,
    top: headerRect.top,
  };
}

function findTopPlacement(geometry: RexPageGeometry): RexPlacement {
  const size = rexSize();
  const top = geometry.headerBottom + SEAT_PADDING;
  const candidates = createRexSeatCandidates({
    bottom: geometry.bottom,
    bounds: geometry.bounds,
    gap: SEAT_PADDING,
    maxRows: 4,
    size,
    top,
  });
  const fallbackLeft =
    geometry.bounds.left +
    (Math.max(geometry.bounds.left, geometry.bounds.right - size) -
      geometry.bounds.left) /
      2;

  return (
    chooseRexPlacement(
      candidates,
      geometry.obstacles,
      size,
      SEAT_PADDING,
    ) ?? { left: fallbackLeft, top }
  );
}

export function RexMascot() {
  const pathname = usePathname();
  const { enabled, hydrated } = useRexPreference();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const currentXRef = useRef(VIEWPORT_PADDING);
  const directionRef = useRef<RexDirection>(1);
  const idleCountRef = useRef(0);
  const modeRef = useRef<RexMode>("walking");
  const seatAnimationRef = useRef<Animation | null>(null);
  const seatOriginRef = useRef<DOMRect | null>(null);
  const [mode, setMode] = useState<RexMode>("walking");
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [smallViewport, setSmallViewport] = useState(false);
  const staticMascot = reducedMotion || smallViewport;

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

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

    const geometry = measurePageGeometry();
    const placement = findTopPlacement(geometry);
    const shellRect = shell.getBoundingClientRect();
    seatAnimationRef.current?.cancel();
    button.hidden = false;
    button.style.visibility = "visible";
    button.dataset.rexPage = pathname;
    button.dataset.rexPosition = "resting";
    button.style.setProperty("--rex-size", `${rexSize()}px`);
    button.style.setProperty("--rex-facing", "1");
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
  }, [pathname]);

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
      }, PAGE_GEOMETRY_DEBOUNCE);
    };
    const observer = new ResizeObserver(onLayoutChange);
    const header = document.querySelector<HTMLElement>(".dashboard-topbar");
    const navbarLane = header?.querySelector<HTMLElement>(
      "[data-rex-navbar-lane]",
    );
    const navbarGroups = header?.querySelectorAll<HTMLElement>(
      ".dashboard-topbar__leading, .dashboard-search, .dashboard-topbar__actions",
    );
    const content = document.querySelector<HTMLElement>("#dashboard-content");
    const sidebar = document.querySelector<HTMLElement>(
      ".dashboard-sidebar--desktop",
    );
    const firstPageElement = content?.firstElementChild;
    const onPotentialPageChange = (event: Event) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "[role='tab'], .section-tabs button, button[aria-expanded], summary",
        )
      ) {
        onLayoutChange();
      }
    };
    const onSettledScroll = () => {
      if (modeRef.current !== "seated") onLayoutChange();
    };
    if (header) observer.observe(header);
    if (navbarLane) observer.observe(navbarLane);
    navbarGroups?.forEach((group) => observer.observe(group));
    if (content) observer.observe(content);
    if (sidebar) observer.observe(sidebar);
    if (firstPageElement instanceof HTMLElement) {
      observer.observe(firstPageElement);
    }
    content?.addEventListener("click", onPotentialPageChange);
    window.addEventListener("resize", onLayoutChange, { passive: true });
    window.addEventListener("scroll", onSettledScroll, {
      capture: true,
      passive: true,
    });
    window.visualViewport?.addEventListener("resize", onLayoutChange, {
      passive: true,
    });

    return () => {
      clearTimeout(debounceTimer);
      observer.disconnect();
      content?.removeEventListener("click", onPotentialPageChange);
      window.removeEventListener("resize", onLayoutChange);
      window.removeEventListener("scroll", onSettledScroll, true);
      window.visualViewport?.removeEventListener("resize", onLayoutChange);
    };
  }, [enabled, hydrated, pathname]);

  useEffect(() => {
    const button = buttonRef.current;
    if (!button || !hydrated || !enabled) return;

    if (mode === "seated") {
      placeAtTop();
      return;
    }

    const geometry = measureNavbarGeometry();
    if (!geometry) {
      button.hidden = true;
      return;
    }
    const lane = chooseRexNavbarLane({
      bounds: geometry.bounds,
      height: geometry.height,
      obstacles: geometry.obstacles,
      padding: NAVBAR_OBSTACLE_PADDING,
      preferredX: currentXRef.current,
      size: geometry.size,
      top: geometry.top,
    });
    if (!lane) {
      button.hidden = true;
      return;
    }
    const minimumX = lane.left;
    const maximumX = lane.right;
    currentXRef.current = clamp(currentXRef.current, minimumX, maximumX);
    button.hidden = false;
    button.style.visibility = "visible";
    button.dataset.rexPage = pathname;
    button.dataset.rexPosition =
      mode === "idle" ? "navbar-idle" : "navbar-walking";
    button.style.setProperty("--rex-size", `${geometry.size}px`);
    button.style.bottom = "auto";
    button.style.left = "0px";
    button.style.top = `${lane.top}px`;
    button.style.transform = rexTranslateX(currentXRef.current);

    if (staticMascot || !lane.canWalk) {
      button.dataset.rexDirection = "stationary";
      button.style.setProperty("--rex-facing", "1");
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

    let targetX = directionRef.current === 1 ? maximumX : minimumX;
    if (Math.abs(targetX - currentXRef.current) < 2) {
      directionRef.current = directionRef.current === 1 ? -1 : 1;
      targetX = directionRef.current === 1 ? maximumX : minimumX;
    }
    button.dataset.rexDirection =
      directionRef.current === 1 ? "right" : "left";
    button.style.setProperty(
      "--rex-facing",
      String(rexScaleForDirection(directionRef.current)),
    );
    const distance = Math.abs(targetX - currentXRef.current);
    const duration = clamp((distance / 42) * 1000, 7000, 42000);
    let finished = false;
    const animation = button.animate(
      [
        { transform: rexTranslateX(currentXRef.current) },
        { transform: rexTranslateX(targetX) },
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
      // Keep the endpoint as the WAAPI fill is canceled during the idle rerender.
      button.style.transform = rexTranslateX(targetX);
      directionRef.current = directionRef.current === 1 ? -1 : 1;
      setMode("idle");
    };

    return () => {
      if (!finished) {
        const rect = button.getBoundingClientRect();
        currentXRef.current = clamp(rect.left, minimumX, maximumX);
      }
      button.style.transform = rexTranslateX(currentXRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      animation.cancel();
    };
  }, [
    enabled,
    hydrated,
    layoutEpoch,
    mode,
    pathname,
    placeAtTop,
    staticMascot,
  ]);

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
