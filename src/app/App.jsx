import React, { useState, useCallback, useEffect } from "react";
import { Toast } from "../components/Toast";
import { Dashboard } from "../pages/Dashboard";
import { Products } from "../pages/Products";
import { Stock } from "../pages/Stock";
import { ManufacturingOrders } from "../pages/ManufacturingOrders";
import { Invoices } from "../pages/Invoices";
import { Clients } from "../pages/Clients";
import { Suppliers } from "../pages/Suppliers";
import { Payments } from "../pages/Payments";
import { CashVouchers } from "../pages/CashVouchers";
import { Expenses } from "../pages/Expenses";
import { HR } from "../pages/HR";
import { CsvImport } from "../pages/CsvImport";
import { Reports } from "../pages/Reports";
import { Settings } from "../pages/Settings";
import { ActivityLog } from "../pages/ActivityLog";
import { sb, SUPABASE_ENABLED } from "../services/supabaseClient";
import { loadData, saveData } from "../services/storage";
import { EMPTY_DATA_TEMPLATE } from "../constants/emptyDataTemplate";
import { INITIAL_DATA } from "../constants/initialData";
import { fetchCloudData, pushInitialData, syncTableChange, SYNC_TABLES } from "../services/sync";
import { generateId, today } from "../utils/format";

export function App({ features, session, profile, trialEndsAt }) {
  const [data, setData] = useState(SUPABASE_ENABLED ? EMPTY_DATA_TEMPLATE : loadData);
  const [page, setPage] = useState("dashboard");
  const [toastMsg, setToastMsg] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    document.body.classList.toggle("sidebar-locked", sidebarOpen);
    return () => document.body.classList.remove("sidebar-locked");
  }, [sidebarOpen]);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("theme", theme);
    } catch {}
  }, [theme]);
  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  const [org, setOrg] = useState(null);
  const [cloudReady, setCloudReady] = useState(!SUPABASE_ENABLED);
  const [cloudError, setCloudError] = useState(null);
  useEffect(() => {
    if (SUPABASE_ENABLED && profile) {
      sb.from("organizations")
        .select("id,name,name_ar,logo_url")
        .eq("id", profile.org_id)
        .single()
        .then(({ data }) => {
          if (data) setOrg(data);
        });
    }
  }, [profile]);

  // ── Initial cloud load — Supabase is the single source of truth.        ──
  // ── A brand-new org simply starts empty; we never seed it from whatever ──
  // ── happens to be sitting in this browser's localStorage (that data    ──
  // ── could belong to a completely different user/org on a shared device).──
  const [cloudRetryKey, setCloudRetryKey] = useState(0);
  const explainCloudError = (e) => {
    const msg = (e?.message || String(e || "")).toLowerCase();
    if (msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch")) {
      return "تعذّر الاتصال بالسحابة — يبدو أن الإنترنت ضعيف أو منقطع حاليًا.";
    }
    if (msg.includes("jwt") || msg.includes("permission") || msg.includes("rls") || msg.includes("denied")) {
      return "ليس لديك صلاحية للوصول إلى هذه البيانات — تواصل مع مزوّد النظام.";
    }
    return "حدث خطأ غير متوقع أثناء تحميل البيانات من السحابة.";
  };
  useEffect(() => {
    if (!SUPABASE_ENABLED || !profile) return;
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      setCloudError(
        "الاتصال بالسحابة بياخد وقت أطول من المعتاد — على الأغلب الإنترنت ضعيف أو غير مستقر حاليًا."
      );
      setCloudReady(true);
    }, 8000);
    (async () => {
      try {
        const cloud = await fetchCloudData(profile.org_id);
        if (cancelled) return;
        cancelled = true;
        clearTimeout(timeout);
        setData((d) => ({
          ...d,
          ...cloud,
        }));
        setCloudError(null);
        setCloudReady(true);
      } catch (e) {
        if (cancelled) return;
        cancelled = true;
        clearTimeout(timeout);
        console.error("Cloud init error:", e);
        setCloudError(explainCloudError(e));
        setCloudReady(true);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [profile, cloudRetryKey]);
  const retryCloudLoad = () => {
    setCloudError(null);
    setCloudReady(false);
    setCloudRetryKey((k) => k + 1);
  };

  // Auto-save a local cache copy ONLY when Supabase is disabled (pure offline mode).
  // When Supabase is enabled, the cloud is the source of truth — we don't
  // mirror it into the shared browser localStorage at all, to avoid any
  // chance of one account's data leaking into another session on the same device.
  useEffect(() => {
    if (!SUPABASE_ENABLED) {
      saveData(data);
      setLastSaved(new Date().toLocaleTimeString("en-EG"));
    }
  }, [data]);
  const toast = (msg) => {
    setToastMsg(msg);
  };
  const update = useCallback(
    (key, items) => {
      let oldItemsCaptured = [];
      setData((d) => {
        oldItemsCaptured = d[key] || [];
        return {
          ...d,
          [key]: items,
        };
      });
      if (SUPABASE_ENABLED && profile && cloudReady) {
        return syncTableChange(profile.org_id, key, oldItemsCaptured, items, profile.id)
          .then((errors) => {
            if (errors && errors.length) {
              const first = errors[0];
              setToastMsg(`⚠️ خطأ مزامنة (${first.table}/${first.op}): ${first.message}`);
            }
            return errors || [];
          })
          .catch((e) => {
            console.error("sync error", key, e);
            setToastMsg("⚠️ خطأ في مزامنة البيانات مع السحابة: " + (e.message || e));
            return [
              {
                table: key,
                op: "sync",
                message: e.message || String(e),
              },
            ];
          });
      }
      return Promise.resolve([]);
    },
    [profile, cloudReady]
  );
  const getStockQty = (pid) => {
    const sl = data.stock_levels.find((s) => s.product_id === pid);
    return sl ? sl.quantity : 0;
  };
  const updateStock = (pid, delta) =>
    setData((d) => {
      const levels = d.stock_levels.map((sl) =>
        sl.product_id === pid
          ? {
              ...sl,
              quantity: Math.max(0, sl.quantity + delta),
            }
          : sl
      );
      if (!levels.find((sl) => sl.product_id === pid) && delta > 0)
        levels.push({
          id: generateId(),
          product_id: pid,
          quantity: delta,
        });
      if (SUPABASE_ENABLED && profile && cloudReady) {
        syncTableChange(profile.org_id, "stock_levels", d.stock_levels, levels, profile.id)
          .then((errors) => {
            if (errors && errors.length) setToastMsg(`⚠️ خطأ مزامنة المخزون: ${errors[0].message}`);
          })
          .catch((e) => console.error("sync stock_levels error", e));
      }
      return {
        ...d,
        stock_levels: levels,
      };
    });
  const wipeCloudOrgData = async () => {
    // Delete in dependency-safe order: children before parents
    const order = [
      "payments",
      "invoices",
      // invoices cascade-deletes invoice_items
      "manufacturing_orders",
      "stock_movements",
      "stock_levels",
      "salary_payments",
      "attendance",
      "products",
      "employees",
      "clients",
      "suppliers",
      "cash_vouchers",
      "expenses",
      "categories",
      "units",
    ];
    const errors = [];
    for (const key of order) {
      const cfg = SYNC_TABLES[key];
      const { error } = await sb.from(cfg.table).delete().eq("org_id", profile.org_id);
      if (error) {
        console.error("wipe error on", cfg.table, error);
        errors.push({
          table: cfg.table,
          message: error.message,
        });
      }
    }
    return errors;
  };
  const resetData = () => {
    if (SUPABASE_ENABLED) {
      toast("إعادة الضبط للبيانات التجريبية غير متاحة عند ربط النظام بالسحابة");
      return;
    }
    if (confirm("هتمسح كل البيانات وترجع للبيانات التجريبية؟")) {
      setData(INITIAL_DATA);
      toast("تم إعادة ضبط البيانات");
    }
  };
  const EMPTY_DATA = EMPTY_DATA_TEMPLATE;
  const wipeAllData = async () => {
    if (
      confirm(
        "⚠️ هيتم مسح كل البيانات نهائيًا (منتجات، عملاء، فواتير، موظفين... كل شيء) بدون رجوع.\nاتأكدت إنك عملت نسخة احتياطية؟ هل تريد المتابعة؟"
      )
    ) {
      if (confirm("تأكيد أخير: هذا الإجراء لا يمكن التراجع عنه. هل أنت متأكد تمامًا؟")) {
        if (SUPABASE_ENABLED && profile) {
          try {
            const errors = await wipeCloudOrgData();
            if (errors.length) {
              toast(
                `⚠️ تم المسح جزئيًا، فشل في: ${errors.map((e) => e.table + " (" + e.message + ")").join("، ")}`
              );
              return;
            }
          } catch (e) {
            toast("حدث خطأ أثناء المسح من السحابة: " + (e.message || e));
            return;
          }
        }
        setData(EMPTY_DATA);
        toast("تم تصفير البيانات بالكامل");
      }
    }
  };
  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `factory-backup-${today()}.json`;
    a.click();
    toast("تم تصدير البيانات ✓");
  };
  const importData = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const d = JSON.parse(ev.target.result);
          if (SUPABASE_ENABLED && profile) {
            if (!confirm("سيتم استبدال كل البيانات الحالية في السحابة ببيانات الملف المستورد. متابعة؟"))
              return;
            toast("جاري الاستيراد...");
            const wipeErrors = await wipeCloudOrgData();
            if (wipeErrors.length) {
              toast(`⚠️ تعذر مسح بعض البيانات القديمة: ${wipeErrors.map((e) => e.table).join("، ")}`);
            }
            const merged = {
              ...EMPTY_DATA,
              ...d,
            };
            await pushInitialData(profile.org_id, merged);
            const cloud = await fetchCloudData(profile.org_id);
            setData((c) => ({
              ...c,
              ...cloud,
            }));
          } else {
            setData(d);
          }
          toast("تم استيراد البيانات ✓");
        } catch (err) {
          console.error(err);
          alert("الملف غير صالح: " + (err.message || err));
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };
  const navItemsAll = [
    {
      id: "dashboard",
      label: "لوحة التحكم",
      icon: "📊",
      group: "رئيسي",
      feature: "core",
      roles: ["owner", "admin", "accountant", "sales", "warehouse", "staff"],
    },
    {
      id: "invoices",
      label: "الفواتير",
      icon: "📄",
      group: "المبيعات",
      feature: "core",
      roles: ["owner", "admin", "accountant", "sales"],
    },
    {
      id: "clients",
      label: "العملاء",
      icon: "👥",
      group: "المبيعات",
      feature: "core",
      roles: ["owner", "admin", "accountant", "sales"],
    },
    {
      id: "products",
      label: "المنتجات",
      icon: "👕",
      group: "المخزون",
      feature: "core",
      roles: ["owner", "admin", "accountant", "sales", "warehouse"],
    },
    {
      id: "stock",
      label: "حركة المخزون",
      icon: "🔄",
      group: "المخزون",
      feature: "core",
      roles: ["owner", "admin", "warehouse"],
    },
    {
      id: "manufacturing_orders",
      label: "أوامر التصنيع",
      icon: "🏗️",
      group: "المخزون",
      feature: "core",
      roles: ["owner", "admin", "warehouse"],
    },
    {
      id: "suppliers",
      label: "الموردون",
      icon: "🏭",
      group: "المشتريات",
      feature: "core",
      roles: ["owner", "admin", "accountant", "warehouse"],
    },
    {
      id: "payments",
      label: "المدفوعات",
      icon: "💰",
      group: "الحسابات",
      feature: "core",
      roles: ["owner", "admin", "accountant"],
    },
    {
      id: "cash_vouchers",
      label: "سندات القبض والصرف",
      icon: "🧾",
      group: "الحسابات",
      feature: "cash_vouchers",
      roles: ["owner", "admin", "accountant"],
    },
    {
      id: "expenses",
      label: "المصروفات",
      icon: "💸",
      group: "الحسابات",
      feature: "core",
      roles: ["owner", "admin", "accountant"],
    },
    {
      id: "hr",
      label: "الموارد البشرية",
      icon: "🧑‍💼",
      group: "الموارد البشرية",
      feature: "hr",
      roles: ["owner", "admin", "accountant"],
    },
    {
      id: "csv_import",
      label: "استيراد CSV",
      icon: "📥",
      group: "البيانات",
      feature: "csv_import",
      roles: ["owner", "admin"],
    },
    {
      id: "reports",
      label: "التقارير",
      icon: "📈",
      group: "التقارير",
      feature: "reports_advanced",
      roles: ["owner", "admin", "accountant"],
    },
    {
      id: "activity_log",
      label: "سجل الأنشطة",
      icon: "📋",
      group: "الإعدادات",
      feature: "core",
      roles: ["owner", "admin"],
    },
    {
      id: "settings",
      label: "الإعدادات",
      icon: "⚙️",
      group: "الإعدادات",
      feature: "core",
      roles: ["owner", "admin", "accountant", "sales", "warehouse", "staff"],
    },
  ];
  const myRole = profile?.role || "owner"; // when Supabase disabled, profile is null -> full access
  const navItems = navItemsAll.filter((n) => features[n.feature] !== false && n.roles.includes(myRole));
  const groups = [...new Set(navItems.map((n) => n.group))];
  const pageTitles = Object.fromEntries(navItems.map((n) => [n.id, n.label]));
  const lowStockCount = data.products.filter(
    (p) => getStockQty(p.id) < p.min_stock_level && p.is_active
  ).length;
  const pendingCount = data.invoices.filter((i) =>
    ["draft", "confirmed", "partial"].includes(i.status)
  ).length;
  useEffect(() => {
    if (navItems.length && !navItems.find((n) => n.id === page)) setPage("dashboard");
  }, [features, myRole]);
  const pages = {
    dashboard: <Dashboard data={data} setPage={setPage} getStockQty={getStockQty} />,
    products: <Products data={data} update={update} updateStock={updateStock} getStockQty={getStockQty} toast={toast} />,
    stock: (
      <Stock data={data} update={update} getStockQty={getStockQty} updateStock={updateStock} toast={toast} org={org} />
    ),
    manufacturing_orders: <ManufacturingOrders data={data} update={update} updateStock={updateStock} toast={toast} />,
    invoices: <Invoices data={data} update={update} updateStock={updateStock} toast={toast} org={org} />,
    clients: <Clients data={data} update={update} toast={toast} org={org} />,
    suppliers: <Suppliers data={data} update={update} toast={toast} org={org} />,
    payments: <Payments data={data} update={update} toast={toast} />,
    cash_vouchers: <CashVouchers data={data} update={update} toast={toast} />,
    expenses: <Expenses data={data} update={update} toast={toast} />,
    hr: <HR data={data} update={update} toast={toast} org={org} />,
    csv_import: <CsvImport data={data} update={update} toast={toast} />,
    reports: <Reports data={data} getStockQty={getStockQty} org={org} />,
    settings: SUPABASE_ENABLED ? (
      <Settings profile={profile} toast={toast} />
    ) : (
      <div className="card">
        <div className="card-body">الإعدادات متاحة فقط عند تفعيل Supabase.</div>
      </div>
    ),
    activity_log: SUPABASE_ENABLED ? (
      <ActivityLog profile={profile} toast={toast} />
    ) : (
      <div className="card">
        <div className="card-body">سجل الأنشطة متاح فقط عند تفعيل Supabase.</div>
      </div>
    ),
  };
  if (!cloudReady) {
    return (
      <React.Fragment>
        <style>{`@keyframes loading-bar{0%{transform:translateX(300%)}100%{transform:translateX(-400%)}}`}</style>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg)",
            fontFamily: "'IBM Plex Sans Arabic',sans-serif",
            gap: 14,
          }}
        >
          <div
            style={{
              fontSize: 38,
            }}
          >
            👖
          </div>
          <div
            style={{
              fontSize: 14,
              color: "var(--text2)",
              fontWeight: 500,
            }}
          >
            جاري تحميل البيانات…
          </div>
          <div
            style={{
              width: 180,
              height: 3,
              background: "var(--border)",
              borderRadius: 99,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: "45%",
                background: "var(--accent-teal)",
                borderRadius: 99,
                animation: "loading-bar 1.4s ease-in-out infinite",
              }}
            />
          </div>
        </div>
      </React.Fragment>
    );
  }
  return (
    <React.Fragment>
      {cloudError && (
        <div
          style={{
            position: "fixed",
            top: 0,
            insetInlineStart: 0,
            insetInlineEnd: 0,
            background: "var(--amber-bg)",
            color: "#7a4f00",
            textAlign: "center",
            padding: "9px 14px",
            fontSize: 13,
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span>⚠️ {cloudError} يتم العمل حاليًّا بالبيانات المخزّنة محليًا.</span>
          <button
            className="btn btn-secondary btn-sm"
            style={{
              background: "#fff",
            }}
            onClick={retryCloudLoad}
          >
            🔄 إعادة المحاولة
          </button>
        </div>
      )}
      <div className="app">
        <div
          className={`sidebar-overlay${sidebarOpen ? " open" : ""}`}
          onClick={() => setSidebarOpen(false)}
        />
        <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
          <div className="sidebar-logo">
            <div className="logo-icon">
              {org?.logo_url ? (
                <img
                  src={org.logo_url}
                  alt="logo"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: 10,
                  }}
                />
              ) : (
                "👖"
              )}
            </div>
            <div>
              <div className="logo-title">{org?.name_ar || org?.name || "مصنع الملابس"}</div>
              <div className="logo-sub">نظام إدارة مصنع الملابس</div>
            </div>
            <button
              className="sidebar-close-btn"
              onClick={() => setSidebarOpen(false)}
              aria-label="إغلاق القائمة"
            >
              ✕
            </button>
          </div>
          {groups.map((g) => (
            <div className="nav-group" key={g}>
              <div className="nav-group-label">{g}</div>
              {navItems
                .filter((n) => n.group === g)
                .map((n) => (
                  <div
                    key={n.id}
                    className={`nav-item${page === n.id ? " active" : ""}`}
                    onClick={() => {
                      setPage(n.id);
                      setSidebarOpen(false);
                    }}
                  >
                    <span className="nav-icon">{n.icon}</span>
                    <span
                      style={{
                        flex: 1,
                      }}
                    >
                      {n.label}
                    </span>
                    {n.id === "invoices" && pendingCount > 0 && (
                      <span
                        style={{
                          background: "var(--amber)",
                          color: "#fff",
                          fontSize: 10,
                          padding: "2px 7px",
                          borderRadius: 10,
                          fontWeight: 700,
                        }}
                      >
                        {pendingCount}
                      </span>
                    )}
                    {n.id === "stock" && lowStockCount > 0 && (
                      <span
                        style={{
                          background: "var(--red)",
                          color: "#fff",
                          fontSize: 10,
                          padding: "2px 7px",
                          borderRadius: 10,
                          fontWeight: 700,
                        }}
                      >
                        {lowStockCount}
                      </span>
                    )}
                  </div>
                ))}
            </div>
          ))}
          {(myRole === "owner" || myRole === "admin") && (
            <div
              style={{
                marginTop: "auto",
                padding: "12px 8px",
                borderTop: "1px solid rgba(255,255,255,.08)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text3)",
                  padding: "0 8px 6px",
                  textTransform: "uppercase",
                  letterSpacing: ".08em",
                }}
              >
                البيانات
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <button
                  onClick={exportData}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "none",
                    border: "none",
                    color: "rgba(255,255,255,.65)",
                    cursor: "pointer",
                    fontSize: 13,
                    fontFamily: "inherit",
                    transition: "all .15s",
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.1)")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "none")}
                >
                  💾 تصدير نسخة احتياطية
                </button>
                <button
                  onClick={importData}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "none",
                    border: "none",
                    color: "rgba(255,255,255,.65)",
                    cursor: "pointer",
                    fontSize: 13,
                    fontFamily: "inherit",
                    transition: "all .15s",
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.1)")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "none")}
                >
                  📂 استيراد بيانات
                </button>
                {!SUPABASE_ENABLED && (
                  <button
                    onClick={resetData}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "none",
                      border: "none",
                      color: "#ff8a8a",
                      cursor: "pointer",
                      fontSize: 13,
                      fontFamily: "inherit",
                      transition: "all .15s",
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.1)")}
                    onMouseOut={(e) => (e.currentTarget.style.background = "none")}
                  >
                    🔄 إعادة ضبط (بيانات تجريبية)
                  </button>
                )}
                {myRole === "owner" && (
                  <button
                    onClick={wipeAllData}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "none",
                      border: "none",
                      color: "#ff4d4d",
                      cursor: "pointer",
                      fontSize: 13,
                      fontFamily: "inherit",
                      transition: "all .15s",
                      fontWeight: 700,
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.1)")}
                    onMouseOut={(e) => (e.currentTarget.style.background = "none")}
                  >
                    🗑️ تصفير كامل (فاضي)
                  </button>
                )}
              </div>
            </div>
          )}
        </aside>
        <main className="main">
          <div className="topbar">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <button className="menu-toggle" onClick={() => setSidebarOpen(true)}>
                ☰
              </button>
              <div className="topbar-title">{pageTitles[page] || page}</div>
            </div>
            <div className="topbar-actions">
              <button
                className="theme-toggle"
                onClick={toggleTheme}
                title={theme === "dark" ? "الوضع الفاتح" : "الوضع الغامق"}
                aria-label="تبديل الثيم"
              >
                {theme === "dark" ? "☀️" : "🌙"}
              </button>
              {profile && (
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--text2)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "var(--green)",
                    }}
                  />
                  {profile.full_name} (
                  {{
                    owner: "مالك",
                    admin: "مدير",
                    accountant: "محاسب",
                    sales: "مبيعات",
                    warehouse: "مخزن",
                    staff: "موظف",
                  }[profile.role] || profile.role}
                  )
                </span>
              )}
              {trialEndsAt &&
                (() => {
                  const trialDate = new Date(trialEndsAt);
                  const trialMidnight = new Date(trialDate.getFullYear(), trialDate.getMonth(), trialDate.getDate());
                  const now = new Date();
                  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                  const daysLeft = Math.round((trialMidnight - nowMidnight) / 86400000);
                  if (daysLeft > 7) return null;
                  return (
                    <span
                      className="badge"
                      style={{
                        background: daysLeft <= 2 ? "var(--red-bg)" : "var(--amber-bg)",
                        color: daysLeft <= 2 ? "var(--red)" : "var(--amber)",
                      }}
                    >
                      ⏰ باقي {Math.max(daysLeft, 0)} يوم على انتهاء الفترة التجريبية
                    </span>
                  );
                })()}
              {session && SUPABASE_ENABLED && (
                <button className="btn btn-secondary btn-sm" onClick={() => sb.auth.signOut()}>
                  تسجيل الخروج
                </button>
              )}
              {lastSaved && <span className="save-badge">💾 محفوظ {lastSaved}</span>}
              <span
                style={{
                  fontSize: 12,
                  color: "var(--text3)",
                }}
              >
                {new Date().toLocaleDateString("ar-EG", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  numberingSystem: "latn",
                })}
              </span>
            </div>
          </div>
          <div className="content">{pages[page]}</div>
        </main>
      </div>
      {toastMsg && <Toast msg={toastMsg} onHide={() => setToastMsg(null)} />}
    </React.Fragment>
  );
}
