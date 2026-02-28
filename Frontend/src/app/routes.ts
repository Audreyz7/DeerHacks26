import { createBrowserRouter } from "react-router";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { Dashboard } from "./pages/Dashboard";
import { Hydration } from "./pages/Hydration";
import { Focus } from "./pages/Focus";
import { Rest } from "./pages/Rest";
import { Persona } from "./pages/Persona";
import { Settings } from "./pages/Settings";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: DashboardLayout,
    children: [
      { index: true, Component: Dashboard },
      { path: "water", Component: Hydration },
      { path: "focus", Component: Focus },
      { path: "rest", Component: Rest },
      { path: "persona", Component: Persona },
      { path: "settings", Component: Settings },
    ],
  },
]);
