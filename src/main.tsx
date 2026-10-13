import "@/styles/app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppLayout } from "@/app/layout";
import { Providers } from "@/app/providers";

// biome-ignore lint/style/noNonNullAssertion: root element is defined in index.html
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      <AppLayout />
    </Providers>
  </StrictMode>,
);
