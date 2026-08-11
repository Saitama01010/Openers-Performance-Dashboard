import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  chooseRexNavbarLane,
  chooseRexPlacement,
  createRexSeatCandidates,
  rexOverlapArea,
  rexScaleForDirection,
} from "@/components/dashboard/rex-placement";

describe("Rex safe placement", () => {
  it("chooses the clear candidate with the most breathing room", () => {
    const candidates = [
      { left: 20, top: 80 },
      { left: 200, top: 80 },
      { left: 380, top: 80 },
    ];
    const obstacles = [{ height: 80, left: 0, top: 60, width: 150 }];

    expect(chooseRexPlacement(candidates, obstacles, 64, 12)).toEqual(
      candidates[2],
    );
  });

  it("falls back to the candidate with the least overlap", () => {
    const candidates = [
      { left: 0, top: 0 },
      { left: 50, top: 0 },
      { left: 100, top: 0 },
    ];
    const obstacles = [{ height: 64, left: -5, top: 0, width: 155 }];

    expect(chooseRexPlacement(candidates, obstacles, 64)).toEqual(
      candidates[2],
    );
    expect(rexOverlapArea(candidates[0], 64, obstacles[0])).toBeGreaterThan(
      rexOverlapArea(candidates[2], 64, obstacles[0]),
    );
  });

  it("builds center, left, and right resting options from page measurements", () => {
    expect(
      createRexSeatCandidates({
        bottom: 400,
        bounds: { left: 200, right: 1000 },
        maxRows: 2,
        size: 64,
        top: 80,
      }),
    ).toEqual([
      { left: 568, top: 80 },
      { left: 200, top: 80 },
      { left: 936, top: 80 },
      { left: 568, top: 158 },
      { left: 200, top: 158 },
      { left: 936, top: 158 },
    ]);
  });

  it("keeps the walking segment clear of the title, search, and actions", () => {
    expect(
      chooseRexNavbarLane({
        bounds: { left: 100, right: 900 },
        height: 58,
        obstacles: [
          { height: 40, left: 100, top: 9, width: 120 },
          { height: 40, left: 420, top: 9, width: 230 },
          { height: 40, left: 720, top: 9, width: 180 },
        ],
        padding: 10,
        preferredX: 260,
        size: 50,
        top: 0,
      }),
    ).toEqual({ canWalk: true, left: 230, right: 360, top: 4 });
  });

  it("stops in place when a navbar gap fits Rex but has no travel room", () => {
    expect(
      chooseRexNavbarLane({
        bounds: { left: 100, right: 150 },
        height: 60,
        obstacles: [],
        size: 50,
        top: 0,
      }),
    ).toEqual({ canWalk: false, left: 100, right: 100, top: 5 });
  });

  it("returns no placement instead of overlapping a crowded navbar", () => {
    expect(
      chooseRexNavbarLane({
        bounds: { left: 100, right: 180 },
        height: 60,
        obstacles: [{ height: 60, left: 100, top: 0, width: 80 }],
        size: 50,
        top: 0,
      }),
    ).toBeNull();
  });

  it("mirrors the left-facing source only for rightward travel", () => {
    expect(rexScaleForDirection(-1)).toBe(1);
    expect(rexScaleForDirection(1)).toBe(-1);
  });
});

describe("Rex authenticated shell integration", () => {
  it("mounts one toggle and mascot outside role-gated import access", () => {
    const shell = readFileSync(
      resolve(process.cwd(), "src/components/dashboard/dashboard-shell-client.tsx"),
      "utf8",
    );
    const actions = shell.slice(shell.indexOf('className="dashboard-topbar__actions"'));

    expect(shell).toContain("<RexMascot />");
    expect(shell).toContain("data-rex-navbar-lane");
    expect(actions.indexOf("<RexToggle />")).toBeGreaterThan(
      actions.indexOf('user.role !== "agent"'),
    );
    expect(actions.indexOf("<RexToggle />")).toBeGreaterThan(
      actions.indexOf(") : null}"),
    );
  });

  it("keeps preference, motion, cleanup, and accessibility behavior client-only", () => {
    const component = readFileSync(
      resolve(process.cwd(), "src/components/dashboard/rex-mascot.tsx"),
      "utf8",
    );

    expect(component.startsWith('"use client"')).toBe(true);
    expect(component).toContain('"openers.rex.enabled"');
    expect(component).toContain("aria-pressed={enabled}");
    expect(component).toContain('window.matchMedia("(prefers-reduced-motion: reduce)")');
    expect(component).toContain('document.addEventListener("visibilitychange"');
    expect(component).toContain('document.removeEventListener("visibilitychange"');
    expect(component).toContain("observer.disconnect()");
    expect(component).toContain("animation.cancel()");
    expect(component).toContain("usePathname()");
    expect(component).toContain("chooseRexNavbarLane");
    expect(component).toContain('".dashboard-topbar__leading"');
    expect(component).toContain('".dashboard-search"');
    expect(component).toContain('".dashboard-topbar__actions"');
    expect(component).toContain("[role='tab']");
    expect(component).toContain("button.dataset.rexDirection");
    expect(component).not.toContain("fetch(");
  });

  it("anchors Rex at the lane endpoint before idle rerender and animation cleanup", () => {
    const component = readFileSync(
      resolve(process.cwd(), "src/components/dashboard/rex-mascot.tsx"),
      "utf8",
    );
    const finishHandler = component.slice(
      component.indexOf("animation.onfinish"),
      component.indexOf("return () =>", component.indexOf("animation.onfinish")),
    );
    const cleanup = component.slice(
      component.indexOf("return () =>", component.indexOf("animation.onfinish")),
      component.indexOf("  }, [", component.indexOf("animation.onfinish")),
    );

    expect(finishHandler.indexOf("button.style.transform")).toBeLessThan(
      finishHandler.indexOf('setMode("idle")'),
    );
    expect(cleanup.indexOf("button.style.transform")).toBeLessThan(
      cleanup.indexOf("animation.cancel()"),
    );
  });

  it("hides the navbar lane before tablet controls can become crowded", () => {
    const globals = readFileSync(
      resolve(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    const tabletRule = globals.slice(globals.indexOf("@media (max-width: 52rem)"));

    expect(tabletRule).toContain(".dashboard-topbar__rex-lane");
    expect(tabletRule).toContain("display: none");
  });

  it("uses an exact five-cell transparent sprite sheet", () => {
    const sprite = readFileSync(
      resolve(process.cwd(), "public/mascot/rex-sprite-v2.png"),
    );
    const width = sprite.readUInt32BE(16);
    const height = sprite.readUInt32BE(20);
    const colorType = sprite[25];

    expect(width).toBe(height * 5);
    expect(colorType).toBe(6);
    expect(createHash("sha256").update(sprite).digest("hex")).toBe(
      "20ed9ce7734d86e4545cf7c5dff201070b673e35c24627b4cdcdbea8b94479e8",
    );
  });
});
