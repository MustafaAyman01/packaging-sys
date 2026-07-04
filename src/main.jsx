import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";
import { AppRoot } from "./app/AppRoot";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>
);
