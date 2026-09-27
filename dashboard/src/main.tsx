import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider, createTheme } from "@mantine/core";
import "@fontsource-variable/inter";
import "@mantine/core/styles.css";
import "@mantine/charts/styles.css";
import { App } from "./App";

const theme = createTheme({
  primaryColor: "indigo",
  fontFamily: "'Inter Variable', system-ui, sans-serif",
  headings: { fontFamily: "'Inter Variable', system-ui, sans-serif", fontWeight: "700" },
  defaultRadius: "lg",
});

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <QueryClientProvider client={queryClient}><App /></QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
