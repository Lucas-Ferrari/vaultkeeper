import { onlineManager, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createAppRouter } from "./router";
import { createQueryClient } from "./shared/lib/query-client";
import "./styles.css";

// onlineManager only reacts to online/offline EVENTS: a cold start offline (served from the SW
// precache) fires none, so seed it from the browser's current state (R-PWA-3 S1).
onlineManager.setOnline(navigator.onLine);

const queryClient = createQueryClient({ queries: { staleTime: 30_000, retry: 1 } });
const router = createAppRouter({ queryClient });

const container = document.getElementById("root");
if (!container) throw new Error("#root element missing from index.html");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
