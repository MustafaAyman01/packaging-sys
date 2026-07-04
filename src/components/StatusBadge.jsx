import { STATUS_LABELS } from "../constants/labels";

const STATUS_COLORS = {
  paid: { bg: "#e6f7f1", color: "#0d9e6a" },
  partial: { bg: "#fdf3e0", color: "#c47f0a" },
  confirmed: { bg: "#e8f0fd", color: "#1a5fbd" },
  draft: { bg: "#eef0f4", color: "#4a5568" },
  cancelled: { bg: "#fce8ec", color: "#d63250" },
};

export function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.draft;
  return (
    <span className="badge" style={{ background: c.bg, color: c.color }}>
      {STATUS_LABELS[status]}
    </span>
  );
}
