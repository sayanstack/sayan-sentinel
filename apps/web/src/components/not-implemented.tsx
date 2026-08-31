export function NotImplementedPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text">{title}</h1>
        <p className="mt-1 text-text-muted">{description}</p>
      </header>
      <div className="rounded-lg border border-dashed border-border p-10 text-center">
        <p className="text-text">Not implemented yet.</p>
        <p className="mt-1 text-sm text-text-muted">
          Tracked in{" "}
          <code className="rounded bg-surface-raised px-1 py-0.5 text-text">
            docs/implementation-plan.md
          </code>
          .
        </p>
      </div>
    </div>
  );
}
