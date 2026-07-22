export type Role = "admin" | "manager" | "agent";

export type Actor = {
  id: string;
  role: Role;
  teamIds: string[];
};

export type ScopedProfile = {
  id: string;
  teamIds: string[];
};

export function canAccessProfile(actor: Actor, target: ScopedProfile) {
  if (actor.role === "admin") {
    return true;
  }

  if (actor.role === "agent") {
    return actor.id === target.id;
  }

  return target.teamIds.some((teamId) => actor.teamIds.includes(teamId));
}

export function canImportForProfile(actor: Actor, target: ScopedProfile) {
  if (actor.role === "agent") {
    return false;
  }

  return canAccessProfile(actor, target);
}

export function assertCanAccessProfile(actor: Actor, target: ScopedProfile) {
  if (!canAccessProfile(actor, target)) {
    throw new Error("Forbidden");
  }
}

export function assertCanImportForProfile(actor: Actor, target: ScopedProfile) {
  if (!canImportForProfile(actor, target)) {
    throw new Error("Forbidden");
  }
}
