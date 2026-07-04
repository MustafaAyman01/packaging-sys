import React, { useState } from "react";
import { printPayrollSheet } from "../features/print/printPayroll";
import { generateId, fc, fd, today } from "../utils/format";
import { ATTENDANCE_LABELS } from "../constants/labels";

export function HR({ data, update, toast, org }) {
  const [tab, setTab] = useState("employees");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [salForm, setSalForm] = useState({});
  const [attDate, setAttDate] = useState(today());
  const [advForm, setAdvForm] = useState({});
  const [penForm, setPenForm] = useState({});
  const [printMonth, setPrintMonth] = useState(new Date().toISOString().slice(0, 7));

  // Employees CRUD
  const openNewEmp = () => {
    setEditing(null);
    setForm({
      name: "",
      job_title: "",
      department: "",
      phone: "",
      email: "",
      hire_date: today(),
      salary: "",
      daily_rate: "",
      overtime_hourly_rate: "",
      is_active: true,
      notes: "",
    });
    setShowModal(true);
  };
  const openEditEmp = (e) => {
    setEditing(e);
    setForm({
      ...e,
    });
    setShowModal(true);
  };
  const saveEmp = () => {
    if (!form.name || !form.salary) return;
    const payload = {
      ...form,
      salary: +form.salary,
      daily_rate: form.daily_rate ? +form.daily_rate : null,
      overtime_hourly_rate: form.overtime_hourly_rate ? +form.overtime_hourly_rate : null,
    };
    if (editing)
      update(
        "employees",
        data.employees.map((e) =>
          e.id === editing.id
            ? {
                ...payload,
                id: editing.id,
              }
            : e
        )
      );
    else
      update("employees", [
        ...data.employees,
        {
          ...payload,
          id: generateId(),
        },
      ]);
    setShowModal(false);
    toast(editing ? "تم تعديل بيانات الموظف ✓" : "تم إضافة الموظف ✓");
  };
  const delEmp = (id) => {
    if (confirm("حذف الموظف؟")) {
      update(
        "employees",
        data.employees.filter((e) => e.id !== id)
      );
      toast("تم الحذف");
    }
  };
  const activeEmps = data.employees.filter((e) => e.is_active);
  const totalSalaries = activeEmps.reduce((s, e) => s + e.salary, 0);
  // سعر اليوم وسعر ساعة الأوفرتايم — يُحسبان تلقائيًا من الراتب الأساسي إلا إذا كان
  // للموظف قيمة مخصصة (override) محفوظة في بياناته
  const getDailyRate = (emp) => emp?.daily_rate || (emp?.salary ? emp.salary / 30 : 0);
  const getOvertimeHourlyRate = (emp) =>
    emp?.overtime_hourly_rate || (emp?.salary ? (emp.salary / 30 / 8) * 1.5 : 0);

  // Salary payments
  const openPaySalary = (emp) => {
    const month = new Date().toISOString().slice(0, 7);
    const summary = getMonthlyAttendanceSummary(emp.id, month);
    setSalForm({
      employee_id: emp.id,
      base_salary: emp.salary,
      deduction_amount: summary ? Math.round(summary.deductionAmount * 100) / 100 : 0,
      overtime_amount: summary ? Math.round(summary.overtimeAmount * 100) / 100 : 0,
      penalties_amount: summary ? Math.round(summary.penaltiesAmount * 100) / 100 : 0,
      advance_deduction: "",
      period_month: month,
      payment_date: today(),
      notes: "",
    });
  };
  const paySalary = () => {
    if (!salForm.employee_id) {
      toast("لازم تحدد الموظف أولًا");
      return;
    }
    if (!salForm.base_salary || +salForm.base_salary <= 0) {
      toast("الراتب الأساسي لازم يكون أكبر من صفر");
      return;
    }
    const emp = data.employees.find((e) => e.id === salForm.employee_id);
    const alreadyPaid = data.salary_payments.find(
      (sp) => sp.employee_id === salForm.employee_id && sp.period_month === salForm.period_month
    );
    if (alreadyPaid) {
      const ok = confirm(
        `تنبيه: تم صرف راتب ${emp?.name || "هذا الموظف"} عن شهر ${salForm.period_month} مسبقًا بتاريخ ${fd(alreadyPaid.payment_date)} بمبلغ ${fc(alreadyPaid.net_amount ?? alreadyPaid.amount)}.\n\nهل تريد المتابعة وصرف راتب إضافي لنفس الشهر؟`
      );
      if (!ok) return;
    }
    const baseSalary = +salForm.base_salary || 0;
    const deductionAmount = +salForm.deduction_amount || 0;
    const overtimeAmount = +salForm.overtime_amount || 0;
    const penaltiesAmount = +salForm.penalties_amount || 0;
    const advanceDeduction = +salForm.advance_deduction || 0;
    const grossAfterAttendance = baseSalary + overtimeAmount - deductionAmount - penaltiesAmount;
    const netAmount = grossAfterAttendance - advanceDeduction;
    if (netAmount <= 0) {
      const ok = confirm(
        `تحذير: صافي الراتب المحسوب هو ${fc(netAmount)} (صفر أو أقل) بسبب الخصومات/السلفة.\n\nهل تريد المتابعة بنفس القيمة؟`
      );
      if (!ok) return;
    }
    let deductionBreakdown = [];
    if (advanceDeduction > 0) {
      const empAdvances = data.advances
        .filter((a) => a.employee_id === salForm.employee_id && a.remaining_amount > 0)
        .sort((x, y) => (x.advance_date || "").localeCompare(y.advance_date || ""));
      const totalRemaining = empAdvances.reduce((s, a) => s + a.remaining_amount, 0);
      if (advanceDeduction > totalRemaining) {
        toast(`قيمة خصم السلفة أكبر من إجمالي السلف المتبقية (${fc(totalRemaining)})`);
        return;
      }
      let toDeduct = advanceDeduction;
      const updatedAdvances = data.advances.map((a) => {
        if (a.employee_id !== salForm.employee_id || a.remaining_amount <= 0 || toDeduct <= 0) return a;
        const cut = Math.min(a.remaining_amount, toDeduct);
        toDeduct -= cut;
        deductionBreakdown.push({
          advance_id: a.id,
          cut,
        });
        return {
          ...a,
          remaining_amount: a.remaining_amount - cut,
        };
      });
      update("advances", updatedAdvances);
    }
    const expId = generateId();
    const payId = generateId();
    update("salary_payments", [
      ...data.salary_payments,
      {
        ...salForm,
        id: payId,
        base_salary: baseSalary,
        deduction_amount: deductionAmount,
        overtime_amount: overtimeAmount,
        penalties_amount: penaltiesAmount,
        advance_deduction: advanceDeduction,
        advance_deduction_breakdown: deductionBreakdown,
        amount: baseSalary,
        // محفوظة للتوافق مع السجلات القديمة التي تعتمد على amount
        net_amount: netAmount,
        expense_id: expId,
      },
    ]);
    const noteParts = [];
    if (overtimeAmount > 0) noteParts.push(`+ أوفر تايم ${fc(overtimeAmount)}`);
    if (deductionAmount > 0) noteParts.push(`- خصم حضور ${fc(deductionAmount)}`);
    if (penaltiesAmount > 0) noteParts.push(`- جزاءات ${fc(penaltiesAmount)}`);
    if (advanceDeduction > 0) noteParts.push(`- سلفة ${fc(advanceDeduction)}`);
    const autoNote = noteParts.length ? `(${noteParts.join(" ، ")})` : "";
    update("expenses", [
      ...data.expenses,
      {
        id: expId,
        title: `راتب ${emp?.name || ""} - ${salForm.period_month}`,
        amount: netAmount,
        expense_date: salForm.payment_date,
        category: "رواتب",
        notes: `${salForm.notes || ""} ${autoNote}`.trim(),
      },
    ]);
    setSalForm({});
    toast("تم صرف الراتب وتسجيله في المصروفات ✓");
  };
  const delSalaryPayment = (sp) => {
    if (
      !confirm(
        "حذف سجل صرف الراتب؟ سيتم حذف المصروف المرتبط به أيضًا، وسيتم إرجاع قيمة خصم السلفة (إن وجدت) إلى السلفة المتبقية."
      )
    )
      return;
    update(
      "salary_payments",
      data.salary_payments.filter((s) => s.id !== sp.id)
    );
    if (sp.expense_id)
      update(
        "expenses",
        data.expenses.filter((e) => e.id !== sp.expense_id)
      );
    if (sp.advance_deduction_breakdown?.length) {
      update(
        "advances",
        data.advances.map((a) => {
          const entry = sp.advance_deduction_breakdown.find((b) => b.advance_id === a.id);
          return entry
            ? {
                ...a,
                remaining_amount: a.remaining_amount + entry.cut,
              }
            : a;
        })
      );
    }
    toast("تم الحذف");
  };

  // Attendance
  const attForDate = data.attendance.filter((a) => a.date === attDate);
  const setAttendance = (empId, status) => {
    const existing = data.attendance.find((a) => a.employee_id === empId && a.date === attDate);
    // تحديد تلقائي منطقي لنوع الخصم حسب الحالة المختارة (قابل للتعديل اليدوي بعدها)
    const defaultDeduction = status === "absent" ? "full" : status === "late" ? "quarter" : "none";
    if (existing)
      update(
        "attendance",
        data.attendance.map((a) =>
          a.id === existing.id
            ? {
                ...a,
                status,
                deduction_type:
                  a.deduction_type !== undefined && a.deduction_type !== null
                    ? a.deduction_type
                    : defaultDeduction,
              }
            : a
        )
      );
    else
      update("attendance", [
        ...data.attendance,
        {
          id: generateId(),
          employee_id: empId,
          date: attDate,
          status,
          deduction_type: defaultDeduction,
          overtime_hours: 0,
          notes: "",
        },
      ]);
  };
  const setAttendanceField = (empId, field, value) => {
    const existing = data.attendance.find((a) => a.employee_id === empId && a.date === attDate);
    if (existing)
      update(
        "attendance",
        data.attendance.map((a) =>
          a.id === existing.id
            ? {
                ...a,
                [field]: value,
              }
            : a
        )
      );
    else
      update("attendance", [
        ...data.attendance,
        {
          id: generateId(),
          employee_id: empId,
          date: attDate,
          status: "present",
          deduction_type: "none",
          overtime_hours: 0,
          notes: "",
          [field]: value,
        },
      ]);
  };
  const DEDUCTION_LABELS = {
    none: "بدون خصم",
    quarter: "خصم ربع يوم",
    half: "خصم نص يوم",
    full: "خصم يوم كامل",
  };
  const DEDUCTION_FRACTIONS = {
    none: 0,
    quarter: 0.25,
    half: 0.5,
    full: 1,
  };
  // حساب ملخص الحضور/الغياب + الخصومات والأوفرتايم لموظف معين في شهر معين
  // هذا الملخص هو ما يُستخدم تلقائيًا عند صرف الراتب لتقليل التدخل اليدوي
  const getMonthlyAttendanceSummary = (empId, periodMonth) => {
    if (!empId || !periodMonth) return null;
    const emp = data.employees.find((e) => e.id === empId);
    const records = data.attendance.filter(
      (a) => a.employee_id === empId && a.date && a.date.slice(0, 7) === periodMonth
    );
    const absentDays = records.filter((a) => a.status === "absent").length;
    const leaveDays = records.filter((a) => a.status === "leave").length;
    const presentDays = records.filter((a) => a.status === "present").length;
    const lateDays = records.filter((a) => a.status === "late").length;
    const deductionDaysEquivalent = records.reduce(
      (s, a) => s + (DEDUCTION_FRACTIONS[a.deduction_type] || 0),
      0
    );
    const totalOvertimeHours = records.reduce((s, a) => s + (+a.overtime_hours || 0), 0);
    const dailyRate = getDailyRate(emp);
    const overtimeRate = getOvertimeHourlyRate(emp);
    const deductionAmount = deductionDaysEquivalent * dailyRate;
    const overtimeAmount = totalOvertimeHours * overtimeRate;
    const penaltiesAmount = getMonthlyPenalties(empId, periodMonth).reduce((s, p) => s + (+p.amount || 0), 0);
    return {
      absentDays,
      leaveDays,
      presentDays,
      lateDays,
      deductionDaysEquivalent,
      totalOvertimeHours,
      dailyRate,
      overtimeRate,
      deductionAmount,
      overtimeAmount,
      penaltiesAmount,
    };
  };
  // جزاءات الموظف (مستقلة عن الحضور — قد تكون لمخالفة تأديبية وليس غيابًا)
  const getMonthlyPenalties = (empId, periodMonth) => {
    if (!empId || !periodMonth) return [];
    return (data.penalties || []).filter(
      (p) => p.employee_id === empId && p.penalty_date && p.penalty_date.slice(0, 7) === periodMonth
    );
  };
  const openNewPenalty = () => {
    setPenForm({
      employee_id: "",
      amount: "",
      penalty_date: today(),
      reason: "",
      notes: "",
    });
  };
  const savePenalty = () => {
    if (!penForm.employee_id || !penForm.amount || !penForm.reason) {
      toast("لازم تحدد الموظف والمبلغ وسبب الجزاء");
      return;
    }
    update("penalties", [
      ...(data.penalties || []),
      {
        ...penForm,
        id: generateId(),
        amount: +penForm.amount,
      },
    ]);
    setPenForm({});
    toast("تم تسجيل الجزاء ✓");
  };
  const delPenalty = (pen) => {
    if (!confirm("حذف سجل الجزاء؟")) return;
    update(
      "penalties",
      (data.penalties || []).filter((p) => p.id !== pen.id)
    );
    toast("تم الحذف");
  };
  const penaltiesSorted = [...(data.penalties || [])].sort((a, b) =>
    (b.penalty_date || "").localeCompare(a.penalty_date || "")
  );
  const salForAttendanceSummary = getMonthlyAttendanceSummary(salForm.employee_id, salForm.period_month);
  const salFormAlreadyPaid =
    salForm.employee_id && salForm.period_month
      ? data.salary_payments.find(
          (sp) => sp.employee_id === salForm.employee_id && sp.period_month === salForm.period_month
        )
      : null;

  // Advances (سلف الموظفين)
  const openNewAdvance = () => {
    setAdvForm({
      employee_id: "",
      amount: "",
      advance_date: today(),
      reason: "",
      notes: "",
    });
  };
  const saveAdvance = () => {
    if (!advForm.employee_id || !advForm.amount) return;
    update("advances", [
      ...data.advances,
      {
        ...advForm,
        id: generateId(),
        amount: +advForm.amount,
        remaining_amount: +advForm.amount,
      },
    ]);
    setAdvForm({});
    toast("تم تسجيل السلفة ✓");
  };
  const delAdvance = (adv) => {
    if (!confirm("حذف سجل السلفة؟")) return;
    update(
      "advances",
      data.advances.filter((a) => a.id !== adv.id)
    );
    toast("تم الحذف");
  };
  const getRemainingAdvance = (empId) => {
    if (!empId) return 0;
    return data.advances
      .filter((a) => a.employee_id === empId)
      .reduce((s, a) => s + (a.remaining_amount || 0), 0);
  };
  const salEmpRemainingAdvance = getRemainingAdvance(salForm.employee_id);
  const advancesSorted = [...data.advances].sort((a, b) =>
    (b.advance_date || "").localeCompare(a.advance_date || "")
  );
  const salariesSorted = [...data.salary_payments].sort((a, b) =>
    b.payment_date.localeCompare(a.payment_date)
  );
  return (
    <div>
      <div
        className="stat-grid"
        style={{
          gridTemplateColumns: "repeat(3,1fr)",
          marginBottom: 16,
        }}
      >
        <div className="stat-card">
          <div className="stat-label">عدد الموظفين النشطين</div>
          <div className="stat-value">{activeEmps.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">إجمالي الرواتب الشهرية</div>
          <div
            className="stat-value"
            style={{
              fontSize: 17,
              color: "var(--blue)",
            }}
          >
            {fc(totalSalaries)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">رواتب مدفوعة (سجل)</div>
          <div
            className="stat-value"
            style={{
              fontSize: 17,
              color: "var(--green)",
            }}
          >
            {fc(data.salary_payments.reduce((s, p) => s + (p.net_amount ?? p.amount), 0))}
          </div>
        </div>
      </div>
      <div className="tabs">
        <div className={`tab${tab === "employees" ? " active" : ""}`} onClick={() => setTab("employees")}>
          الموظفون
        </div>
        <div className={`tab${tab === "salaries" ? " active" : ""}`} onClick={() => setTab("salaries")}>
          الرواتب
        </div>
        <div className={`tab${tab === "attendance" ? " active" : ""}`} onClick={() => setTab("attendance")}>
          الحضور والغياب
        </div>
        <div className={`tab${tab === "advances" ? " active" : ""}`} onClick={() => setTab("advances")}>
          السلف
        </div>
        <div className={`tab${tab === "penalties" ? " active" : ""}`} onClick={() => setTab("penalties")}>
          الجزاءات
        </div>
      </div>
      {tab === "employees" && (
        <div>
          <div
            style={{
              marginBottom: 16,
              textAlign: "left",
            }}
          >
            <button className="btn btn-primary" onClick={openNewEmp}>
              + موظف جديد
            </button>
          </div>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>الوظيفة</th>
                  <th>القسم</th>
                  <th>الهاتف</th>
                  <th>تاريخ التعيين</th>
                  <th>الراتب</th>
                  <th>الحالة</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.employees.map((e) => (
                  <tr key={e.id}>
                    <td
                      style={{
                        fontWeight: 500,
                      }}
                    >
                      {e.name}
                    </td>
                    <td>{e.job_title || "—"}</td>
                    <td>
                      <span className="tag">{e.department || "—"}</span>
                    </td>
                    <td>{e.phone || "—"}</td>
                    <td>{fd(e.hire_date)}</td>
                    <td
                      style={{
                        fontWeight: 500,
                      }}
                    >
                      {fc(e.salary)}
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: e.is_active ? "var(--green-bg)" : "var(--surface3)",
                          color: e.is_active ? "var(--green)" : "var(--text3)",
                        }}
                      >
                        {e.is_active ? "نشط" : "موقوف"}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => {
                            setTab("salaries");
                            openPaySalary(e);
                          }}
                        >
                          صرف راتب
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEditEmp(e)}>
                          تعديل
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => delEmp(e.id)}>
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.employees.length === 0 && (
              <div className="empty-state">
                <div className="icon">👤</div>
                <p>لا يوجد موظفون</p>
              </div>
            )}
          </div>
        </div>
      )}
      {tab === "salaries" && (
        <div>
          <div
            className="card"
            style={{
              marginBottom: 20,
            }}
          >
            <div className="card-header">
              <span className="card-title">صرف راتب جديد</span>
            </div>
            <div className="card-body">
              <div className="form-row form-row-3">
                <div className="form-group">
                  <label>الموظف *</label>
                  <select
                    value={salForm.employee_id || ""}
                    onChange={(e) => {
                      const emp = data.employees.find((x) => x.id === e.target.value);
                      if (emp) {
                        openPaySalary(emp);
                      } else {
                        setSalForm({});
                      }
                    }}
                  >
                    <option value="">اختر موظف</option>
                    {data.employees
                      .filter((e) => e.is_active)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>الراتب الأساسي *</label>
                  <input
                    type="number"
                    value={salForm.base_salary || ""}
                    onChange={(e) =>
                      setSalForm({
                        ...salForm,
                        base_salary: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>الشهر</label>
                  <input
                    type="month"
                    value={salForm.period_month || ""}
                    onChange={(e) => {
                      const newMonth = e.target.value;
                      const summary = getMonthlyAttendanceSummary(salForm.employee_id, newMonth);
                      setSalForm({
                        ...salForm,
                        period_month: newMonth,
                        deduction_amount: summary ? Math.round(summary.deductionAmount * 100) / 100 : 0,
                        overtime_amount: summary ? Math.round(summary.overtimeAmount * 100) / 100 : 0,
                        penalties_amount: summary ? Math.round(summary.penaltiesAmount * 100) / 100 : 0,
                      });
                    }}
                  />
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>تاريخ الصرف</label>
                  <input
                    type="date"
                    value={salForm.payment_date || today()}
                    onChange={(e) =>
                      setSalForm({
                        ...salForm,
                        payment_date: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>ملاحظات</label>
                  <input
                    value={salForm.notes || ""}
                    onChange={(e) =>
                      setSalForm({
                        ...salForm,
                        notes: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              {salFormAlreadyPaid && (
                <div
                  className="alert alert-warning"
                  style={{
                    marginBottom: 14,
                  }}
                >
                  ⚠️ تم صرف راتب هذا الموظف عن شهر {salForm.period_month} بالفعل بتاريخ{" "}
                  {fd(salFormAlreadyPaid.payment_date)} بمبلغ{" "}
                  {fc(salFormAlreadyPaid.net_amount ?? salFormAlreadyPaid.amount)}. المتابعة ستسجّل راتبًا
                  إضافيًا لنفس الشهر.
                </div>
              )}
              {salForm.employee_id && salForm.period_month && (
                <React.Fragment>
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      marginBottom: 14,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      className="badge"
                      style={{
                        background: "var(--surface3)",
                        color: "var(--text2)",
                      }}
                    >
                      حاضر: {salForAttendanceSummary?.presentDays ?? 0} يوم
                    </span>
                    <span
                      className="badge"
                      style={{
                        background: "var(--red-bg)",
                        color: "var(--red)",
                      }}
                    >
                      الغياب: {salForAttendanceSummary?.absentDays ?? 0} يوم
                    </span>
                    <span
                      className="badge"
                      style={{
                        background: "var(--amber-bg)",
                        color: "var(--amber)",
                      }}
                    >
                      إجازات حضور: {salForAttendanceSummary?.leaveDays ?? 0} يوم
                    </span>
                    {salForAttendanceSummary?.lateDays > 0 && (
                      <span
                        className="badge"
                        style={{
                          background: "var(--amber-bg)",
                          color: "var(--amber)",
                        }}
                      >
                        تأخير: {salForAttendanceSummary.lateDays} يوم
                      </span>
                    )}
                    {salEmpRemainingAdvance > 0 && (
                      <span
                        className="badge"
                        style={{
                          background: "var(--amber-bg)",
                          color: "var(--amber)",
                        }}
                      >
                        سلفة متبقية: {fc(salEmpRemainingAdvance)}
                      </span>
                    )}
                  </div>
                  <div
                    className="totals-box"
                    style={{
                      marginBottom: 14,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "var(--text3)",
                        marginBottom: 10,
                      }}
                    >
                      تم حساب البنود الآتية تلقائيًا من سجلات الحضور والسلف لهذا الشهر — يمكنك التعديل عليها
                      يدويًا عند الحاجة.
                    </div>
                    <div className="form-row form-row-3">
                      <div
                        className="form-group"
                        style={{
                          marginBottom: 0,
                        }}
                      >
                        <label>+ أوفر تايم (ج.م)</label>
                        <input
                          type="number"
                          value={salForm.overtime_amount || ""}
                          onChange={(e) =>
                            setSalForm({
                              ...salForm,
                              overtime_amount: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div
                        className="form-group"
                        style={{
                          marginBottom: 0,
                        }}
                      >
                        <label>- خصم حضور/انصراف (ج.م)</label>
                        <input
                          type="number"
                          value={salForm.deduction_amount || ""}
                          onChange={(e) =>
                            setSalForm({
                              ...salForm,
                              deduction_amount: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div
                        className="form-group"
                        style={{
                          marginBottom: 0,
                        }}
                      >
                        <label>- جزاءات (ج.م)</label>
                        <input
                          type="number"
                          value={salForm.penalties_amount || ""}
                          onChange={(e) =>
                            setSalForm({
                              ...salForm,
                              penalties_amount: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                    <div
                      className="form-group"
                      style={{
                        marginTop: 14,
                        marginBottom: 0,
                        maxWidth: 240,
                      }}
                    >
                      <label>- خصم من السلفة (اختياري)</label>
                      <input
                        type="number"
                        placeholder="0"
                        value={salForm.advance_deduction || ""}
                        onChange={(e) =>
                          setSalForm({
                            ...salForm,
                            advance_deduction: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div
                      className="totals-row total"
                      style={{
                        marginTop: 16,
                      }}
                    >
                      <span>الصافي النهائي</span>
                      <span
                        style={{
                          color:
                            (+salForm.base_salary || 0) +
                              (+salForm.overtime_amount || 0) -
                              (+salForm.deduction_amount || 0) -
                              (+salForm.penalties_amount || 0) -
                              (+salForm.advance_deduction || 0) >=
                            0
                              ? "var(--green)"
                              : "var(--red)",
                          fontSize: 19,
                        }}
                      >
                        {fc(
                          (+salForm.base_salary || 0) +
                            (+salForm.overtime_amount || 0) -
                            (+salForm.deduction_amount || 0) -
                            (+salForm.penalties_amount || 0) -
                            (+salForm.advance_deduction || 0)
                        )}
                      </span>
                    </div>
                  </div>
                </React.Fragment>
              )}
              <div
                style={{
                  marginTop: 14,
                  textAlign: "left",
                }}
              >
                <button className="btn btn-primary" onClick={paySalary}>
                  صرف الراتب
                </button>
              </div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-end",
              marginBottom: 14,
            }}
          >
            <div
              className="form-group"
              style={{
                marginBottom: 0,
                maxWidth: 200,
              }}
            >
              <label>شهر الطباعة</label>
              <input type="month" value={printMonth} onChange={(e) => setPrintMonth(e.target.value)} />
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => {
                const monthPayments = data.salary_payments.filter((sp) => sp.period_month === printMonth);
                if (monthPayments.length === 0) {
                  toast("لا توجد رواتب مصروفة في هذا الشهر");
                  return;
                }
                printPayrollSheet(printMonth, monthPayments, data.employees, org);
              }}
            >
              🖨️ طباعة كشف مرتبات الشهر
            </button>
          </div>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>الموظف</th>
                  <th>الشهر</th>
                  <th>المبلغ</th>
                  <th>ملاحظات</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {salariesSorted.map((sp) => {
                  const emp = data.employees.find((e) => e.id === sp.employee_id);
                  return (
                    <tr key={sp.id}>
                      <td>{fd(sp.payment_date)}</td>
                      <td
                        style={{
                          fontWeight: 500,
                        }}
                      >
                        {emp?.name || "—"}
                      </td>
                      <td>
                        <span className="tag">{sp.period_month}</span>
                      </td>
                      <td
                        style={{
                          fontWeight: 600,
                          color: "var(--green)",
                        }}
                      >
                        {fc(sp.net_amount ?? sp.amount)}
                        {sp.advance_deduction > 0 && (
                          <div
                            style={{
                              fontSize: 11.5,
                              fontWeight: 400,
                              color: "var(--amber)",
                            }}
                          >
                            (بعد خصم سلفة {fc(sp.advance_deduction)})
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          color: "var(--text2)",
                          fontSize: 13,
                        }}
                      >
                        {sp.notes || "—"}
                      </td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => delSalaryPayment(sp)}>
                          حذف
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {data.salary_payments.length === 0 && (
              <div className="empty-state">
                <div className="icon">💰</div>
                <p>لا توجد رواتب مصروفة</p>
              </div>
            )}
          </div>
        </div>
      )}
      {tab === "attendance" && (
        <div>
          <div
            className="form-group"
            style={{
              maxWidth: 220,
              marginBottom: 16,
            }}
          >
            <label>التاريخ</label>
            <input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} />
          </div>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th>القسم</th>
                  <th>الحالة</th>
                  <th>تسجيل سريع</th>
                  <th>الخصم</th>
                  <th>ساعات أوفر تايم</th>
                </tr>
              </thead>
              <tbody>
                {activeEmps.map((e) => {
                  const att = attForDate.find((a) => a.employee_id === e.id);
                  const colors = {
                    present: {
                      bg: "var(--green-bg)",
                      color: "var(--green)",
                    },
                    absent: {
                      bg: "var(--red-bg)",
                      color: "var(--red)",
                    },
                    leave: {
                      bg: "var(--blue-bg)",
                      color: "var(--blue)",
                    },
                    late: {
                      bg: "var(--amber-bg)",
                      color: "var(--amber)",
                    },
                  };
                  const c = att
                    ? colors[att.status]
                    : {
                        bg: "var(--surface3)",
                        color: "var(--text3)",
                      };
                  return (
                    <tr key={e.id}>
                      <td
                        style={{
                          fontWeight: 500,
                        }}
                      >
                        {e.name}
                      </td>
                      <td>
                        <span className="tag">{e.department || "—"}</span>
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            background: c.bg,
                            color: c.color,
                          }}
                        >
                          {att ? ATTENDANCE_LABELS[att.status] : "لم يسجل"}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          {Object.entries(ATTENDANCE_LABELS).map(([k, v]) => (
                            <button
                              key={k}
                              className={`btn btn-sm ${att?.status === k ? "btn-primary" : "btn-secondary"}`}
                              onClick={() => setAttendance(e.id, k)}
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td
                        style={{
                          width: 150,
                        }}
                      >
                        <select
                          value={att?.deduction_type || "none"}
                          disabled={!att}
                          onChange={(ev) => setAttendanceField(e.id, "deduction_type", ev.target.value)}
                        >
                          {Object.entries(DEDUCTION_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td
                        style={{
                          width: 110,
                        }}
                      >
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          placeholder="0"
                          disabled={!att}
                          value={att?.overtime_hours || ""}
                          onChange={(ev) => setAttendanceField(e.id, "overtime_hours", +ev.target.value || 0)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {activeEmps.length === 0 && (
              <div className="empty-state">
                <div className="icon">🗓️</div>
                <p>لا يوجد موظفون نشطون</p>
              </div>
            )}
          </div>
        </div>
      )}
      {tab === "advances" && (
        <div>
          <div
            className="card"
            style={{
              marginBottom: 20,
            }}
          >
            <div className="card-header">
              <span className="card-title">سلفة جديدة</span>
            </div>
            <div className="card-body">
              <div className="form-row form-row-3">
                <div className="form-group">
                  <label>الموظف *</label>
                  <select
                    value={advForm.employee_id || ""}
                    onChange={(e) =>
                      setAdvForm({
                        ...advForm,
                        employee_id: e.target.value,
                      })
                    }
                  >
                    <option value="">اختر موظف</option>
                    {data.employees
                      .filter((e) => e.is_active)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>المبلغ *</label>
                  <input
                    type="number"
                    value={advForm.amount || ""}
                    onChange={(e) =>
                      setAdvForm({
                        ...advForm,
                        amount: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>التاريخ</label>
                  <input
                    type="date"
                    value={advForm.advance_date || today()}
                    onChange={(e) =>
                      setAdvForm({
                        ...advForm,
                        advance_date: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>السبب</label>
                  <input
                    value={advForm.reason || ""}
                    onChange={(e) =>
                      setAdvForm({
                        ...advForm,
                        reason: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>ملاحظات</label>
                  <input
                    value={advForm.notes || ""}
                    onChange={(e) =>
                      setAdvForm({
                        ...advForm,
                        notes: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div
                className="alert alert-success"
                style={{
                  marginBottom: 0,
                }}
              >
                ستظهر السلفة حتى سدادها عند صرف الراتب — الخصم ليس تلقائيًا، القرار لك عند الصرف.
              </div>
              <div
                style={{
                  marginTop: 14,
                  textAlign: "left",
                }}
              >
                <button className="btn btn-primary" onClick={saveAdvance}>
                  تسجيل السلفة
                </button>
              </div>
            </div>
          </div>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>الموظف</th>
                  <th>المبلغ</th>
                  <th>المتبقي</th>
                  <th>السبب</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {advancesSorted.map((adv) => {
                  const emp = data.employees.find((e) => e.id === adv.employee_id);
                  const settled = adv.remaining_amount <= 0;
                  return (
                    <tr key={adv.id}>
                      <td>{fd(adv.advance_date)}</td>
                      <td
                        style={{
                          fontWeight: 500,
                        }}
                      >
                        {emp?.name || "—"}
                      </td>
                      <td>{fc(adv.amount)}</td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            background: settled ? "var(--green-bg)" : "var(--amber-bg)",
                            color: settled ? "var(--green)" : "var(--amber)",
                          }}
                        >
                          {settled ? "تم السداد" : fc(adv.remaining_amount)}
                        </span>
                      </td>
                      <td
                        style={{
                          color: "var(--text2)",
                          fontSize: 13,
                        }}
                      >
                        {adv.reason || "—"}
                      </td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => delAdvance(adv)}>
                          حذف
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {data.advances.length === 0 && (
              <div className="empty-state">
                <div className="icon">💵</div>
                <p>لا توجد سلف مسجلة</p>
              </div>
            )}
          </div>
        </div>
      )}
      {tab === "penalties" && (
        <div>
          <div
            className="card"
            style={{
              marginBottom: 20,
            }}
          >
            <div className="card-header">
              <span className="card-title">تسجيل جزاء جديد</span>
            </div>
            <div className="card-body">
              <div className="form-row form-row-3">
                <div className="form-group">
                  <label>الموظف *</label>
                  <select
                    value={penForm.employee_id || ""}
                    onChange={(e) =>
                      setPenForm({
                        ...penForm,
                        employee_id: e.target.value,
                      })
                    }
                  >
                    <option value="">اختر موظف</option>
                    {data.employees
                      .filter((e) => e.is_active)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>المبلغ *</label>
                  <input
                    type="number"
                    value={penForm.amount || ""}
                    onChange={(e) =>
                      setPenForm({
                        ...penForm,
                        amount: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>التاريخ</label>
                  <input
                    type="date"
                    value={penForm.penalty_date || today()}
                    onChange={(e) =>
                      setPenForm({
                        ...penForm,
                        penalty_date: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>السبب *</label>
                  <input
                    value={penForm.reason || ""}
                    onChange={(e) =>
                      setPenForm({
                        ...penForm,
                        reason: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>ملاحظات</label>
                  <input
                    value={penForm.notes || ""}
                    onChange={(e) =>
                      setPenForm({
                        ...penForm,
                        notes: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div
                className="alert alert-warning"
                style={{
                  marginBottom: 0,
                }}
              >
                سيدخل هذا الجزاء تلقائيًا في حساب راتب الموظف عند الصرف في نفس شهر تاريخ الالجزاء.
              </div>
              <div
                style={{
                  marginTop: 14,
                  textAlign: "left",
                }}
              >
                <button className="btn btn-primary" onClick={savePenalty}>
                  تسجيل الجزاء
                </button>
              </div>
            </div>
          </div>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>الموظف</th>
                  <th>المبلغ</th>
                  <th>السبب</th>
                  <th>ملاحظات</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {penaltiesSorted.map((pen) => {
                  const emp = data.employees.find((e) => e.id === pen.employee_id);
                  return (
                    <tr key={pen.id}>
                      <td>{fd(pen.penalty_date)}</td>
                      <td
                        style={{
                          fontWeight: 500,
                        }}
                      >
                        {emp?.name || "—"}
                      </td>
                      <td
                        style={{
                          fontWeight: 600,
                          color: "var(--red)",
                        }}
                      >
                        {fc(pen.amount)}
                      </td>
                      <td>{pen.reason || "—"}</td>
                      <td
                        style={{
                          color: "var(--text2)",
                          fontSize: 13,
                        }}
                      >
                        {pen.notes || "—"}
                      </td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => delPenalty(pen)}>
                          حذف
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {penaltiesSorted.length === 0 && (
              <div className="empty-state">
                <div className="icon">⚠️</div>
                <p>لا توجد جزاءات مسجلة</p>
              </div>
            )}
          </div>
        </div>
      )}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{editing ? "تعديل بيانات موظف" : "موظف جديد"}</span>
              <button className="close-btn" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>الاسم *</label>
                  <input
                    value={form.name || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        name: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>الوظيفة</label>
                  <input
                    value={form.job_title || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        job_title: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>القسم</label>
                  <input
                    value={form.department || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        department: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>تاريخ التعيين</label>
                  <input
                    type="date"
                    value={form.hire_date || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        hire_date: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>الهاتف</label>
                  <input
                    value={form.phone || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        phone: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>البريد الإلكتروني</label>
                  <input
                    value={form.email || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        email: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>الراتب الشهري *</label>
                  <input
                    type="number"
                    value={form.salary || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        salary: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>الحالة</label>
                  <select
                    value={form.is_active ? "1" : "0"}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        is_active: e.target.value === "1",
                      })
                    }
                  >
                    <option value="1">نشط</option>
                    <option value="0">موقوف</option>
                  </select>
                </div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>سعر اليوم (اختياري)</label>
                  <input
                    type="number"
                    placeholder={`تلقائي: ${fc((+form.salary || 0) / 30)}`}
                    value={form.daily_rate || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        daily_rate: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>سعر ساعة الأوفر تايم (اختياري)</label>
                  <input
                    type="number"
                    placeholder={`تلقائي: ${fc(((+form.salary || 0) / 30 / 8) * 1.5)}`}
                    value={form.overtime_hourly_rate || ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        overtime_hourly_rate: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="form-group">
                <label>ملاحظات</label>
                <textarea
                  value={form.notes || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      notes: e.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                إلغاء
              </button>
              <button className="btn btn-primary" onClick={saveEmp}>
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
