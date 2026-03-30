import { Navigate, Route, Routes } from "react-router-dom";
import { PublicOnlyRoute, ProtectedRoute } from "./auth/RouteGuards";
import { useAuth } from "./auth/AuthContext";
import { OrderEditorPage } from "./pages/OrderEditorPage";
import { PreviewPage } from "./pages/PreviewPage";
import { DatabaseManagerPage } from "./pages/DatabaseManagerPage";
import { HistoryPage } from "./pages/HistoryPage";
import { BillingPage } from "./pages/BillingPage";
import { LoginPage } from "./pages/LoginPage";

export default function App() {
  const { session } = useAuth();

  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<OrderEditorPage />} />
        <Route path="/preview" element={<PreviewPage />} />
        <Route path="/database" element={<DatabaseManagerPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/billing" element={<BillingPage />} />
      </Route>

      <Route path="*" element={<Navigate to={session ? "/" : "/login"} replace />} />
    </Routes>
  );
}
