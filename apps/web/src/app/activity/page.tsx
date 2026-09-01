import { ErrorBanner } from "@/components/error-banner";
import { ApiError, listActivity } from "@/lib/api";

const RESULT_CLASS: Record<string, string> = {
  success: "text-severity-low",
  failure: "text-severity-high",
  pending: "text-severity-medium",
};

export default async function ActivityPage() {
  let events;
  let error: string | null = null;

  try {
    events = await listActivity();
  } catch (e) {
    error = e instanceof ApiError ? e.message : "Could not reach the Sentinel API.";
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text">Activity</h1>
        <p className="mt-1 text-text-muted">
          A real audit trail of target authorization, verification, and revocation events —
          everything that has changed something for your organizations, newest first.
        </p>
      </header>

      {error && <ErrorBanner title="Couldn't load activity" message={error} />}

      {events && events.length === 0 && (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <p className="text-text">No activity recorded yet.</p>
          <p className="mt-1 text-sm text-text-muted">
            Every target you create, verify, or revoke — and every scan a connected repository runs
            — writes a real audit event here.
          </p>
        </div>
      )}

      {events && events.length > 0 && (
        <ol className="space-y-2">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface p-4"
            >
              <div>
                <p className="text-text">
                  <span className="font-medium">{event.action}</span>
                  <span className="text-text-muted"> on {event.resourceType}</span>
                  {event.resourceId && (
                    <code className="ml-1 rounded bg-surface-raised px-1 py-0.5 text-xs text-text-muted">
                      {event.resourceId}
                    </code>
                  )}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {new Date(event.createdAt).toLocaleString()}
                  {event.actorUserId ? ` · ${event.actorUserId}` : ""}
                </p>
              </div>
              <span
                className={`shrink-0 text-xs font-semibold uppercase ${RESULT_CLASS[event.result] ?? "text-text-muted"}`}
              >
                {event.result}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
