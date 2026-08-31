export interface StatCardProps {
  label: string;
  value: number;
  accent?: "cyan" | "blue" | "violet";
}

const ACCENT_CLASSES: Record<NonNullable<StatCardProps["accent"]>, string> = {
  cyan: "text-accent-cyan",
  blue: "text-accent-blue",
  violet: "text-accent-violet",
};

export function StatCard({ label, value, accent }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="text-sm text-text-muted">{label}</div>
      <div
        className={`mt-2 text-3xl font-semibold ${accent ? ACCENT_CLASSES[accent] : "text-text"}`}
      >
        {value}
      </div>
    </div>
  );
}
