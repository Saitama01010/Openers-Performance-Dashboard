"use client";

export function DashboardErrorState({
  description,
  reset,
  title,
}: {
  description: string;
  reset: () => void;
  title: string;
}) {
  return (
    <section className="dashboard-page">
      <div className="error-state" role="alert">
        <div aria-hidden="true" className="error-state__icon">
          !
        </div>
        <div>
          <h1 className="error-state__title">{title}</h1>
          <p className="error-state__description">{description}</p>
          <button
            className="ui-button ui-button--secondary"
            onClick={reset}
            type="button"
          >
            Try again
          </button>
        </div>
      </div>
    </section>
  );
}
