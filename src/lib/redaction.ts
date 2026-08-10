const SECRET_KEY = /(password|passphrase|token|secret|api[_-]?key|authorization|cookie|session|encryption[_-]?key)/i;
const TOKEN_QUERY = /([?&](?:token|key|secret|code)=)[^&#\s]+/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;

export function redactText(value: string) {
  return value
    .replace(TOKEN_QUERY, "$1[REDACTED]")
    .replace(BEARER, "Bearer [REDACTED]");
}

export function redactSecrets(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactText(value);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => redactSecrets(entry, seen));

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      const scalarDiagnostic = entry === null || typeof entry === "number" || typeof entry === "boolean";
      return [
        key,
        SECRET_KEY.test(key) && !scalarDiagnostic
          ? "[REDACTED]"
          : redactSecrets(entry, seen),
      ];
    }),
  );
}
