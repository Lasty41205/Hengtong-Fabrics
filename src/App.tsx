import { Navigate, Route, Routes } from "react-router-dom";
import { OrderEditorPage } from "./pages/OrderEditorPage";
import { PreviewPage } from "./pages/PreviewPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<OrderEditorPage />} />
      <Route path="/preview" element={<PreviewPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
