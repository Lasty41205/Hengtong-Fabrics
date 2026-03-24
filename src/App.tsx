import { Navigate, Route, Routes } from "react-router-dom";
import { OrderEditorPage } from "./pages/OrderEditorPage";
import { PreviewPage } from "./pages/PreviewPage";
import { DatabaseManagerPage } from "./pages/DatabaseManagerPage";
import { HistoryPage } from "./pages/HistoryPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<OrderEditorPage />} />
      <Route path="/preview" element={<PreviewPage />} />
      <Route path="/database" element={<DatabaseManagerPage />} />
      <Route path="/history" element={<HistoryPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
