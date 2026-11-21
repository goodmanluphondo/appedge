export const ROLES = ["viewer", "administrator", "owner"] as const;

export type Role = (typeof ROLES)[number];
export type Permission = "view" | "manage" | "settings";

export const ROLE_CLAIMS: Record<Role, string> = {
  owner: "AppEdge.Owner",
  administrator: "AppEdge.Administrator",
  viewer: "AppEdge.Viewer",
};

const MINIMUM_ROLE_FOR_PERMISSION: Record<Permission, Role> = {
  view: "viewer",
  manage: "administrator",
  settings: "owner",
};

const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  administrator: "Administrator",
  viewer: "Viewer",
};

export const FORBIDDEN_MESSAGE = "Your role does not allow this action.";

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function highestRoleFromClaims(claims: readonly string[]): Role | null {
  const held = ROLES.filter((role) => claims.includes(ROLE_CLAIMS[role]));
  return held.length > 0 ? held[held.length - 1] : null;
}

export function roleAllows(role: Role, permission: Permission): boolean {
  return ROLES.indexOf(role) >= ROLES.indexOf(MINIMUM_ROLE_FOR_PERMISSION[permission]);
}

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role];
}
