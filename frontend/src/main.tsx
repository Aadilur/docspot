import React from "react";
import ReactDOM from "react-dom/client";

import "./shared/i18n";
import "./styles/globals.css";

import App from "./app/App";
import { registerSW } from "./shared/pwa/registerSW";
import { applyTheme, getInitialTheme } from "./shared/theme/theme";

applyTheme(getInitialTheme());
registerSW();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
