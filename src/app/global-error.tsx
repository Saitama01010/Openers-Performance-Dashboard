"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="standalone-state">
          <section className="standalone-state__card" role="alert">
            <p className="standalone-state__overline">Openers</p>
            <h1>Workspace unavailable</h1>
            <p>
              The application could not finish loading. Retry now; if the
              problem continues, return later.
            </p>
            <button
              className="ui-button ui-button--primary"
              onClick={reset}
              type="button"
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
