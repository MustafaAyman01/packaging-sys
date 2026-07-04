import { useState } from "react";
import Papa from "papaparse";
import { generateId, today } from "../utils/format";
import { IMPORT_TARGETS } from "../constants/importTargets";

export function CsvImport({ data, update, toast }) {
  const [target, setTarget] = useState("products");
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [fileName, setFileName] = useState("");
  const [step, setStep] = useState(1); // 1: upload, 2: map, 3: preview/result
  const [result, setResult] = useState(null);
  const config = IMPORT_TARGETS[target];
  const reset = () => {
    setRows([]);
    setHeaders([]);
    setMapping({});
    setFileName("");
    setStep(1);
    setResult(null);
  };
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: "UTF-8",
      complete: (res) => {
        if (res.data.length === 0) {
          toast("الملف فاضي أو غير صالح");
          return;
        }
        setHeaders(res.meta.fields || []);
        setRows(res.data);
        // auto-guess mapping by matching header names loosely
        const guess = {};
        config.fields.forEach((f) => {
          const match = (res.meta.fields || []).find((h) => {
            const hn = h.trim().toLowerCase();
            return (
              hn === f.key.toLowerCase() || hn.includes(f.key.toLowerCase()) || f.label.includes(h.trim())
            );
          });
          if (match) guess[f.key] = match;
        });
        setMapping(guess);
        setStep(2);
      },
      error: () => toast("حدث خطأ في قراءة الملف"),
    });
  };
  const doImport = () => {
    const requiredMissing = config.fields.filter((f) => f.required && !mapping[f.key]);
    if (requiredMissing.length > 0) {
      toast("لازم تربط الحقول المطلوبة: " + requiredMissing.map((f) => f.label).join("، "));
      return;
    }
    let added = 0,
      skipped = 0;
    if (target === "products") {
      const newProducts = [];
      const newStockLevels = [...data.stock_levels];
      const catByName = {};
      data.categories.forEach((c) => (catByName[c.name.trim()] = c.id));
      const unitByName = {};
      data.units.forEach((u) => (unitByName[u.name.trim()] = u.id));
      let newCats = [...data.categories];
      let newUnits = [...data.units];
      rows.forEach((r) => {
        const name = r[mapping.name]?.trim();
        const salePrice = parseFloat(r[mapping.sale_price]);
        if (!name || isNaN(salePrice)) {
          skipped++;
          return;
        }
        let categoryId = data.categories[0]?.id;
        const catName = mapping.category_name ? r[mapping.category_name]?.trim() : "";
        if (catName) {
          if (catByName[catName]) categoryId = catByName[catName];
          else {
            const newId = generateId();
            newCats = [
              ...newCats,
              {
                id: newId,
                name: catName,
              },
            ];
            catByName[catName] = newId;
            categoryId = newId;
          }
        }
        let unitId = data.units[0]?.id;
        const unitName = mapping.unit_name ? r[mapping.unit_name]?.trim() : "";
        if (unitName) {
          if (unitByName[unitName]) unitId = unitByName[unitName];
          else {
            const newId = generateId();
            newUnits = [
              ...newUnits,
              {
                id: newId,
                name: unitName,
                abbreviation: unitName,
              },
            ];
            unitByName[unitName] = newId;
            unitId = newId;
          }
        }
        const id = generateId();
        newProducts.push({
          id,
          sku: mapping.sku ? r[mapping.sku]?.trim() || `IMP-${id.slice(0, 6)}` : `IMP-${id.slice(0, 6)}`,
          name,
          category_id: categoryId,
          unit_id: unitId,
          cost_price: mapping.cost_price ? parseFloat(r[mapping.cost_price]) || 0 : 0,
          sale_price: salePrice,
          min_stock_level: mapping.min_stock_level ? parseFloat(r[mapping.min_stock_level]) || 0 : 0,
          is_active: true,
          created_at: today(),
        });
        const qty = mapping.quantity ? parseFloat(r[mapping.quantity]) || 0 : 0;
        newStockLevels.push({
          id: generateId(),
          product_id: id,
          quantity: qty,
        });
        added++;
      });
      if (newCats.length !== data.categories.length) update("categories", newCats);
      if (newUnits.length !== data.units.length) update("units", newUnits);
      update("products", [...data.products, ...newProducts]);
      update("stock_levels", newStockLevels);
    } else if (target === "clients" || target === "suppliers") {
      const newItems = [];
      rows.forEach((r) => {
        const name = r[mapping.name]?.trim();
        if (!name) {
          skipped++;
          return;
        }
        newItems.push({
          id: generateId(),
          name,
          phone: mapping.phone ? r[mapping.phone] || "" : "",
          email: mapping.email ? r[mapping.email] || "" : "",
          address: mapping.address ? r[mapping.address] || "" : "",
          tax_number: mapping.tax_number ? r[mapping.tax_number] || "" : "",
          ...(target === "clients"
            ? {
                type: "retail",
              }
            : {}),
          is_active: true,
          created_at: today(),
        });
        added++;
      });
      update(target, [...data[target], ...newItems]);
    } else if (target === "employees") {
      const newItems = [];
      rows.forEach((r) => {
        const name = r[mapping.name]?.trim();
        const salary = parseFloat(r[mapping.salary]);
        if (!name || isNaN(salary)) {
          skipped++;
          return;
        }
        newItems.push({
          id: generateId(),
          name,
          job_title: mapping.job_title ? r[mapping.job_title] || "" : "",
          department: mapping.department ? r[mapping.department] || "" : "",
          phone: mapping.phone ? r[mapping.phone] || "" : "",
          email: mapping.email ? r[mapping.email] || "" : "",
          hire_date: mapping.hire_date ? r[mapping.hire_date] || today() : today(),
          salary,
          is_active: true,
          notes: "",
        });
        added++;
      });
      update("employees", [...data.employees, ...newItems]);
    }
    setResult({
      added,
      skipped,
      total: rows.length,
    });
    setStep(3);
    toast(`تم استيراد ${added} سجل بنجاح ✓`);
  };
  return (
    <div>
      <div
        className="card"
        style={{
          marginBottom: 20,
        }}
      >
        <div className="card-header">
          <span className="card-title">استيراد بيانات من ملف CSV</span>
        </div>
        <div className="card-body">
          <div
            className="form-group"
            style={{
              maxWidth: 280,
            }}
          >
            <label>نوع البيانات</label>
            <select
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                reset();
              }}
            >
              {Object.entries(IMPORT_TARGETS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          {step === 1 && (
            <div>
              <div
                className="alert alert-success"
                style={{
                  marginBottom: 14,
                }}
              >
                ارفع ملف CSV يحتوي على صف عناوين (Header) في أول سطر. يفضّل أن يكون الترميز UTF-8.
              </div>
              <div className="form-group">
                <label>اختر ملف CSV</label>
                <input type="file" accept=".csv" onChange={handleFile} />
              </div>
            </div>
          )}
          {step === 2 && (
            <div>
              <div
                style={{
                  marginBottom: 10,
                  fontSize: 13,
                  color: "var(--text2)",
                }}
              >
                الملف: <strong>{fileName}</strong> — {rows.length} صف
              </div>
              <div
                className="alert alert-success"
                style={{
                  marginBottom: 14,
                }}
              >
                اربط كل حقل من النظام بالعمود المناسب من ملفك. الحقول المعلّمة بـ * مطلوبة.
              </div>
              {config.fields.map((f) => (
                <div className="form-row form-row-2" key={f.key}>
                  <div className="form-group">
                    <label>
                      {f.label}
                      {f.required && " *"}
                    </label>
                  </div>
                  <div className="form-group">
                    <select
                      value={mapping[f.key] || ""}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          [f.key]: e.target.value,
                        })
                      }
                    >
                      <option value="">— لا يوجد —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
              <div
                style={{
                  marginTop: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    marginBottom: 6,
                  }}
                >
                  معاينة أول 3 صفوف:
                </div>
                <div
                  style={{
                    overflowX: "auto",
                  }}
                >
                  <table>
                    <thead>
                      <tr>
                        {headers.map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 3).map((r, i) => (
                        <tr key={i}>
                          {headers.map((h) => (
                            <td key={h}>{r[h]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  gap: 10,
                  justifyContent: "flex-start",
                }}
              >
                <button className="btn btn-secondary" onClick={reset}>
                  إلغاء
                </button>
                <button className="btn btn-primary" onClick={doImport}>
                  استيراد {rows.length} صف
                </button>
              </div>
            </div>
          )}
          {step === 3 && result && (
            <div>
              <div className="alert alert-success">
                تم الاستيراد بنجاح ✓<br />
                العدد الإجمالي: {result.total} — تم إضافة: {result.added} — تم تجاهل (بيانات ناقصة):{" "}
                {result.skipped}
              </div>
              <div
                style={{
                  marginTop: 14,
                }}
              >
                <button className="btn btn-primary" onClick={reset}>
                  استيراد ملف آخر
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
