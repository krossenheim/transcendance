import { BrowserRouter } from "react-router-dom";
import { LanguageProvider } from "./i18n";
import ReactDOM from "react-dom/client";
import AppRoot from "./AppRoot";
import React from "react";

import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <AppRoot />
      </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>
);

