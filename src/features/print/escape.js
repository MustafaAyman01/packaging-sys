// Escape للنصوص اللي جاية من المستخدم (أسماء منتجات/عملاء، ملاحظات، عناوين...) قبل ما تتحط
// جوه HTML الطباعة. نافذة الطباعة بتتفتح بنفس الـ origin بتاع التطبيق، فأي كود HTML/JS
// متكتب في اسم منتج مثلاً كان ممكن يتنفذ جواها.
export function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
