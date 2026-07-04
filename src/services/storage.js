import { STORAGE_KEY } from "../constants/emptyDataTemplate";
import { INITIAL_DATA } from "../constants/initialData";

export function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...INITIAL_DATA, ...parsed };
    }
  } catch (e) {}
  return INITIAL_DATA;
}

export function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {}
}
