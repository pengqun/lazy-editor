import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installTestHarness } from "./lib/testHarness";
import "./index.css";

if (import.meta.env.DEV) installTestHarness();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
