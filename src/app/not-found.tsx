import Link from "next/link";

export default function NotFound() {
  return (
    <main className="standalone-state">
      <section className="standalone-state__card">
        <p className="standalone-state__overline">Openers</p>
        <h1>Page not found</h1>
        <p>
          This destination does not exist, or it is outside your current
          reporting scope.
        </p>
        <Link className="ui-button ui-button--primary" href="/dashboard">
          Return to overview
        </Link>
      </section>
    </main>
  );
}
