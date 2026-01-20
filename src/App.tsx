import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import ProtectedRoute from "./routes/ProtectedRoute";
import CredentialsPage from "./pages/CredentialsPage";
import AccountPage from "./pages/AccountPage";
import PositionsPage from "./pages/PositionsPage";
import MarketDataPage from "./pages/MarketDataPage";
import OrdersPage from "./pages/OrdersPage";
import StrategiesPage from "./pages/StrategiesPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/credentials" element={<CredentialsPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/positions" element={<PositionsPage />} />
        <Route path="/market" element={<MarketDataPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/strategies" element={<StrategiesPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
