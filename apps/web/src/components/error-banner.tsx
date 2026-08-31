export function ErrorBanner({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-lg border border-severity-high/30 bg-severity-high/10 p-4 text-sm">
      <p className="font-medium text-severity-high">{title}</p>
      <p className="mt-1 text-text-muted">{message}</p>
      <p className="mt-2 text-text-muted">
        This is expected if the API, database, or Redis aren&apos;t running locally — see{" "}
        <code className="rounded bg-surface-raised px-1 py-0.5 text-text">
          docs/local-development.md
        </code>
        .
      </p>
    </div>
  );
}
