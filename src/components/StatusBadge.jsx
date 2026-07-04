import { STATUS_LABELS } from "../constants/labels";

const STATUS_COLORS = {
  paid: { bg: "var(--green-bg)", color: "var(--green)" },
  partial: { bg: "var(--amber-bg)", color: "var(--amber)" },
  confirmed: { bg: "var(--blue-bg)", color: "var(--blue)" },
  draft: { bg: "var(--surface3)", color: "var(--text2)" },
  cancelled: { bg: "var(--red-bg)", color: "var(--red)" },
};

export function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.draft;
  return (
    <span className="badge" style={{ background: c.bg, color: c.color }}>
      {STATUS_LABELS[status]}
    </span>
  );
}
