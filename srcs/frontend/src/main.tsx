import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import AppRoot from "./AppRoot";
import { LanguageProvider } from "./i18n";
// @ts-ignore: allow importing CSS without type declarations
import "./index.css";
// Initialize the pong favicon on app load
import "./usePongFavicon";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <AppRoot />
      </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>
);
