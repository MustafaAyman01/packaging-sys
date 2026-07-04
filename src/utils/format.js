// معرّف فريد (UUID v4) — يستخدم crypto.randomUUID لو متاح، وإلا fallback يدوي
export const generateId = () =>
  window.crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

// تنسيق المبلغ المالي (جنيه مصري)
export const fc = (n) =>
  `${(+n || 0).toLocaleString("en-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ج.م`;

// تنسيق التاريخ بالعربي
export const fd = (d) => (d ? new Date(d).toLocaleDateString("ar-EG", { numberingSystem: "latn" }) : "—");

// تاريخ اليوم بصيغة YYYY-MM-DD
export const today = () => new Date().toISOString().split("T")[0];
