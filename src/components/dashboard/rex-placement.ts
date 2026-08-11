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

export type RexHorizontalBounds = {
  left: number;
  right: number;
};

export type RexWalkingLane = RexHorizontalBounds & {
  top: number;
};

export type RexNavbarLane = RexWalkingLane & {
  canWalk: boolean;
};

export type RexDirection = -1 | 1;

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

function rexClearance(
  placement: RexPlacement,
  size: number,
  obstacle: RexPlacementRect,
  padding: number,
) {
  const padded = paddedRect(obstacle, padding);
  const horizontalGap = Math.max(
    0,
    padded.left - (placement.left + size),
    placement.left - (padded.left + padded.width),
  );
  const verticalGap = Math.max(
    0,
    padded.top - (placement.top + size),
    placement.top - (padded.top + padded.height),
  );

  return Math.hypot(horizontalGap, verticalGap);
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
  let bestClearance = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const score = obstacles.reduce(
      (total, obstacle) =>
        total + rexOverlapArea(candidate, size, obstacle, padding),
      0,
    );
    const clearance = obstacles.reduce(
      (nearest, obstacle) =>
        Math.min(nearest, rexClearance(candidate, size, obstacle, padding)),
      Number.POSITIVE_INFINITY,
    );

    if (
      score < bestScore ||
      (score === bestScore && clearance > bestClearance)
    ) {
      best = candidate;
      bestScore = score;
      bestClearance = clearance;
    }
  }

  return best;
}

export function createRexSeatCandidates(input: {
  bounds: RexHorizontalBounds;
  bottom: number;
  gap?: number;
  maxRows?: number;
  size: number;
  top: number;
}) {
  const gap = input.gap ?? 14;
  const maxRows = input.maxRows ?? 4;
  const maximumLeft = Math.max(
    input.bounds.left,
    input.bounds.right - input.size,
  );
  const center =
    input.bounds.left + (maximumLeft - input.bounds.left) / 2;
  const columns = [center, input.bounds.left, maximumLeft].filter(
    (value, index, values) =>
      values.findIndex((candidate) => Math.abs(candidate - value) < 1) === index,
  );
  const candidates: RexPlacement[] = [];

  for (let row = 0; row < maxRows; row += 1) {
    const top = input.top + row * (input.size + gap);
    if (top + input.size > input.bottom) break;
    for (const left of columns) candidates.push({ left, top });
  }

  return candidates;
}

type Interval = { left: number; right: number };

function mergeIntervals(intervals: Interval[]) {
  const sorted = [...intervals].sort((a, b) => a.left - b.left);
  const merged: Interval[] = [];

  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.left > previous.right) {
      merged.push({ ...interval });
      continue;
    }
    previous.right = Math.max(previous.right, interval.right);
  }

  return merged;
}

function freeIntervals(bounds: RexHorizontalBounds, blocked: Interval[]) {
  const free: Interval[] = [];
  let cursor = bounds.left;

  for (const interval of mergeIntervals(blocked)) {
    if (interval.left > cursor) {
      free.push({ left: cursor, right: Math.min(interval.left, bounds.right) });
    }
    cursor = Math.max(cursor, interval.right);
    if (cursor >= bounds.right) break;
  }

  if (cursor < bounds.right) free.push({ left: cursor, right: bounds.right });
  return free.filter((interval) => interval.right > interval.left);
}

export function chooseRexNavbarLane(input: {
  bounds: RexHorizontalBounds;
  height: number;
  minTravel?: number;
  obstacles: RexPlacementRect[];
  padding?: number;
  preferredX?: number;
  size: number;
  top: number;
}): RexNavbarLane | null {
  const padding = input.padding ?? 8;
  const minTravel = input.minTravel ?? 24;
  const preferredX = input.preferredX ?? input.bounds.left;
  const mascotBottom = input.top + input.height;
  const blocked = input.obstacles
    .filter(
      (obstacle) =>
        obstacle.top < mascotBottom + padding &&
        obstacle.top + obstacle.height > input.top - padding,
    )
    .map((obstacle) => ({
      left: Math.max(input.bounds.left, obstacle.left - padding),
      right: Math.min(
        input.bounds.right,
        obstacle.left + obstacle.width + padding,
      ),
    }))
    .filter((interval) => interval.right > interval.left);
  let best: RexNavbarLane | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const available of freeIntervals(input.bounds, blocked)) {
    const availableWidth = available.right - available.left;
    if (availableWidth < input.size) continue;
    const maximumLeft = available.right - input.size;
    const travelDistance = maximumLeft - available.left;
    const keepsCurrentPosition =
      preferredX >= available.left && preferredX <= maximumLeft;
    const canWalk = travelDistance >= minTravel;
    const score =
      travelDistance +
      (canWalk ? 10_000 : 0) +
      (keepsCurrentPosition ? Math.min(80, travelDistance * 0.2 + 10) : 0);

    if (score > bestScore) {
      bestScore = score;
      best = {
        canWalk,
        left: available.left,
        right: maximumLeft,
        top: input.top + (input.height - input.size) / 2,
      };
    }
  }

  return best;
}

export function rexScaleForDirection(direction: RexDirection) {
  // The source artwork faces left, so rightward travel must mirror it.
  return direction === 1 ? -1 : 1;
}
