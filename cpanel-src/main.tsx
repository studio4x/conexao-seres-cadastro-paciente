import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import Home from "@/app/page";
import { JornadaYogaPage } from "@/components/jornada-yoga/JornadaYogaPage";
import { JornadaYogaConfirmationPage } from "@/components/jornada-yoga/JornadaYogaConfirmationPage";
import { JornadaYogaAdminPage } from "@/components/jornada-yoga/JornadaYogaAdminPage";
import "@/app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Não foi possível iniciar o formulário.");
}

const path = window.location.pathname.replace(/\/+$/, "") || "/";
const Page =
  path === "/jornada-yoga"
    ? JornadaYogaPage
    : path === "/jornada-yoga/confirmacao"
      ? JornadaYogaConfirmationPage
      : path === "/admin/jornada-yoga"
      ? JornadaYogaAdminPage
      : Home;

createRoot(root).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
