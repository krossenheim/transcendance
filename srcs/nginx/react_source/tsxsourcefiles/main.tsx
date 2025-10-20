import React from "react";
import ReactDOM from "react-dom/client";
import AppRoot from "./AppRoot";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {" "}
    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
      {/* <AppRoot /> */}
      <AppRoot />
    </div>
  </React.StrictMode>
);
