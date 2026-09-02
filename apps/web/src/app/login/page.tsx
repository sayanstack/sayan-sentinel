import { API_URL } from "@/lib/api";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_state: "Your sign-in attempt expired or was tampered with. Please try again.",
  login_failed: "GitHub sign-in failed. Please try again.",
  missing_code: "GitHub didn't return an authorization code. Please try again.",
  access_denied: "You cancelled the GitHub authorization.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface-raised p-8 text-center">
        <div className="bg-gradient-to-r from-accent-cyan via-accent-blue to-accent-violet bg-clip-text text-2xl font-semibold text-transparent">
          Sayan Sentinel
        </div>
        <p className="mt-2 text-sm text-text-muted">
          AI-native application security and code intelligence.
        </p>

        {error && (
          <p className="mt-6 rounded-lg border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm text-red-300">
            {ERROR_MESSAGES[error] ?? "Something went wrong signing you in. Please try again."}
          </p>
        )}

        <a
          href={`${API_URL}/auth/github/login`}
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-text px-4 py-2.5 text-sm font-medium text-surface transition hover:opacity-90"
        >
          <GithubMark />
          Sign in with GitHub
        </a>
      </div>
    </div>
  );
}

function GithubMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
