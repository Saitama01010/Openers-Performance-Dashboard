import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  chooseRexPlacement,
  chooseRexWalkingLane,
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

  it("moves Rex above a blocked bottom lane while keeping content bounds", () => {
    expect(
      chooseRexWalkingLane({
        bottom: 500,
        bounds: { left: 200, right: 1000 },
        maxLanes: 2,
        obstacles: [{ height: 50, left: 200, top: 450, width: 800 }],
        size: 50,
        top: 80,
      }),
    ).toEqual({ left: 200, right: 950, top: 392 });
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
    expect(component).toContain("chooseRexWalkingLane");
    expect(component).toContain("[role='tab']");
    expect(component).toContain("button.dataset.rexDirection");
    expect(component).not.toContain("fetch(");
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
