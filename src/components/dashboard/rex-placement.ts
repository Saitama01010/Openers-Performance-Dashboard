export type RexPlacementRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export type RexPlacement = {
  left: number;
  top: number;
};

function paddedRect(rect: RexPlacementRect, padding: number): RexPlacementRect {
  return {
    height: rect.height + padding * 2,
    left: rect.left - padding,
    top: rect.top - padding,
    width: rect.width + padding * 2,
  };
}

export function rexOverlapArea(
  placement: RexPlacement,
  size: number,
  obstacle: RexPlacementRect,
  padding = 0,
) {
  const padded = paddedRect(obstacle, padding);
  const overlapWidth = Math.max(
    0,
    Math.min(placement.left + size, padded.left + padded.width) -
      Math.max(placement.left, padded.left),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(placement.top + size, padded.top + padded.height) -
      Math.max(placement.top, padded.top),
  );

  return overlapWidth * overlapHeight;
}

export function chooseRexPlacement(
  candidates: RexPlacement[],
  obstacles: RexPlacementRect[],
  size: number,
  padding = 12,
) {
  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const score = obstacles.reduce(
      (total, obstacle) =>
        total + rexOverlapArea(candidate, size, obstacle, padding),
      0,
    );

    if (score === 0) return candidate;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}
