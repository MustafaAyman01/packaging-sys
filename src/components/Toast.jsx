import { useEffect } from "react";

export function Toast({ msg, onHide }) {
  useEffect(() => {
    const t = setTimeout(onHide, 2500);
    return () => clearTimeout(t);
  }, []);
  return <div className="toast">{msg}</div>;
}
