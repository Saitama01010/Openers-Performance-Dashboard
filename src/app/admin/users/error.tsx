"use client";

export default function AdminUsersError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="mx-auto max-w-7xl px-6 py-6">
      <div className="rounded-lg border border-danger/40 bg-danger/10 p-5 text-sm text-danger">
        <p>Users & Access failed to load.</p>
        <button className="mt-3 rounded-md border border-danger px-3 py-2 font-medium" onClick={reset}>
          Try again
        </button>
      </div>
    </section>
  );
}

