import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  chooseRexPlacement,
  rexOverlapArea,
} from "@/components/dashboard/rex-placement";

describe("Rex safe placement", () => {
  it("chooses the first candidate with no padded collision", () => {
    const candidates = [
      { left: 20, top: 80 },
      { left: 200, top: 80 },
      { left: 380, top: 80 },
    ];
    const obstacles = [{ height: 80, left: 0, top: 60, width: 150 }];

    expect(chooseRexPlacement(candidates, obstacles, 64, 12)).toEqual(
      candidates[1],
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
    expect(component).not.toContain("fetch(");
  });

  it("uses an exact five-cell transparent sprite sheet", () => {
    const sprite = readFileSync(
      resolve(process.cwd(), "public/mascot/rex-sprite.png"),
    );
    const width = sprite.readUInt32BE(16);
    const height = sprite.readUInt32BE(20);
    const colorType = sprite[25];

    expect(width).toBe(height * 5);
    expect(colorType).toBe(6);
  });
});
