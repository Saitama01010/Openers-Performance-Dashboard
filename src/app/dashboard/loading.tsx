export default function DashboardLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading dashboard"
      className="mx-auto min-h-screen max-w-[104rem] animate-pulse px-4 py-6 sm:px-6 lg:px-8"
    >
      <div className="h-56 rounded-[1.4rem] border border-border bg-surface" />
      <div className="mt-4 h-20 rounded-[1.125rem] border border-border bg-surface" />
      <div className="mt-8 h-6 w-48 rounded-md bg-surface-raised" />
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            className="h-40 rounded-[1.125rem] border border-border bg-surface"
            key={index}
          />
        ))}
      </div>
      <div className="mt-8 grid gap-4 xl:grid-cols-[1.7fr_.8fr]">
        <div className="h-96 rounded-[1.125rem] border border-border bg-surface" />
        <div className="h-96 rounded-[1.125rem] border border-border bg-surface" />
      </div>
    </main>
  );
}
