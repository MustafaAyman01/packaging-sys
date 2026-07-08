import React from "react";
import { fc, fd } from "../utils/format";
import { buildStatementEntries, printStatement } from "../features/print/statement";

export function StatementModal({ party, partyType, data, org, onClose }) {
  const entries = buildStatementEntries(party, partyType, data);
  const finalBalance = entries.length ? entries[entries.length - 1].balance : 0;
  return (
    <div className="modal-overlay">
      <div className="modal modal-lg">
        <div className="modal-header">
          <span className="modal-title">
            {(partyType === "client" ? "كشف حساب عميل: " : "كشف حساب مورد: ") + party.name}
          </span>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => printStatement(party, partyType, entries, org)}
            >
              🖨️ طباعة
            </button>
            <button className="close-btn" onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        <div className="modal-body">
          {entries.length === 0 ? (
            <div className="empty-state">
              <div className="icon">📋</div>
              <p>لا توجد حركات مسجلة</p>
            </div>
          ) : (
            <React.Fragment>
              <table className="inv-table">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>البيان</th>
                    <th>مدين</th>
                    <th>دائن</th>
                    <th>الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={i}>
                      <td>{fd(e.date)}</td>
                      <td>{e.label}</td>
                      <td>{e.debit > 0 ? fc(e.debit) : "—"}</td>
                      <td>{e.credit > 0 ? fc(e.credit) : "—"}</td>
                      <td
                        style={{
                          fontWeight: 600,
                        }}
                      >
                        {fc(e.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div
                className="totals-box"
                style={{
                  marginTop: 14,
                }}
              >
                <div className="totals-row total">
                  <span>الرصيد النهائي</span>
                  <span
                    style={{
                      color: finalBalance > 0.01 ? "var(--red)" : finalBalance < -0.01 ? "var(--green)" : "var(--text)",
                    }}
                  >
                    {fc(Math.abs(finalBalance))}{" "}
                    {finalBalance > 0.01
                      ? partyType === "client"
                        ? "(مستحق منه)"
                        : "(مستحق له)"
                      : finalBalance < -0.01
                      ? partyType === "client"
                        ? "(له رصيد لدينا)"
                        : "(لنا رصيد عنده)"
                      : ""}
                  </span>
                </div>
              </div>
            </React.Fragment>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
