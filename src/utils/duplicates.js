// بيكتشف مجموعات السجلات المكررة (عملاء أو موردين) اللي غالباً بتمثل نفس الجهة
// فعلياً: نفس الاسم بالظبط (بعد تجاهل المسافات والحالة)، أو نفس رقم التليفون.
// بيستخدم union-find بسيط عشان لو سجلين اتربطوا بمعيار الاسم وسجل تالت اتربط
// بمعيار التليفون مع واحد منهم، الثلاثة يترموا في نفس المجموعة.
export function findDuplicateGroups(list) {
  const byKey = new Map();
  list
    .filter((c) => c.is_active)
    .forEach((c) => {
      const nameKey = "n:" + c.name.trim().toLowerCase();
      if (!byKey.has(nameKey)) byKey.set(nameKey, new Set());
      byKey.get(nameKey).add(c.id);
      if (c.phone && c.phone.trim()) {
        const phoneKey = "p:" + c.phone.trim();
        if (!byKey.has(phoneKey)) byKey.set(phoneKey, new Set());
        byKey.get(phoneKey).add(c.id);
      }
    });
  const groups = [];
  const idToGroup = new Map();
  for (const idSet of byKey.values()) {
    if (idSet.size < 2) continue;
    const ids = [...idSet];
    let target = null;
    for (const id of ids) {
      if (idToGroup.has(id)) {
        target = idToGroup.get(id);
        break;
      }
    }
    if (!target) {
      target = new Set();
      groups.push(target);
    }
    ids.forEach((id) => {
      target.add(id);
      idToGroup.set(id, target);
    });
  }
  return groups.map((g) => [...g]).filter((g) => g.length >= 2);
}
