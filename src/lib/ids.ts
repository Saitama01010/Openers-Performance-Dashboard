import { randomUUID } from "crypto";

export function newId() {
  return randomUUID();
}
