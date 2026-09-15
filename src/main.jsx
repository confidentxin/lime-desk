import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { migrateLegacyStorage } from "./storageKeys.js";
import "./styles.css";

migrateLegacyStorage();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
