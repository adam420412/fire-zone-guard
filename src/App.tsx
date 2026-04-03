import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import KanbanPage from "@/pages/KanbanPage";
import BuildingsPage from "@/pages/BuildingsPage";
import BuildingDetailPage from "@/pages/BuildingDetailPage";
import CompaniesPage from "@/pages/CompaniesPage";
import CertificatesPage from "@/pages/CertificatesPage";
import SettingsPage from "@/pages/SettingsPage";
import ClientPanel from "@/pages/ClientPanel";
import AuthPage from "@/pages/AuthPage";
import AuditsPage from "@/pages/AuditsPage";
import AuditDetailPage from "@/pages/AuditDetailPage";
import ProtocolsPage from "@/pages/ProtocolsPage";
import ProtocolDetailPage from "@/pages/ProtocolDetailPage";
import MeetingsPage from "@/pages/MeetingsPage";
import EmployeesPage from "@/pages/EmployeesPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import CalendarPage from "@/pages/CalendarPage";
import ManufacturersPage from "@/pages/ManufacturersPage";
import CrmPage from "@/pages/CrmPage";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false, // Fail fast on DB/network errors
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoutes() {
  const { user, loading, role } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <AuthPage />;

  const isClient = role === "client";

  return (
    <AppLayout>
      <Routes>
        {isClient ? (
          <>
            <Route path="/" element={<ClientPanel />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<Dashboard />} />
            <Route path="/kanban" element={<KanbanPage />} />
            <Route path="/buildings" element={<BuildingsPage />} />
            <Route path="/buildings/:id" element={<BuildingDetailPage />} />
            <Route path="/companies" element={<CompaniesPage />} />
            <Route path="/audits" element={<AuditsPage />} />
            <Route path="/audits/:id" element={<AuditDetailPage />} />
            <Route path="/protocols" element={<ProtocolsPage />} />
            <Route path="/protocols/:id" element={<ProtocolDetailPage />} />
            <Route path="/certificates" element={<CertificatesPage />} />
            <Route path="/meetings" element={<MeetingsPage />} />
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/manufacturers" element={<ManufacturersPage />} />
            <Route path="/crm" element={<CrmPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </>
        )}
      </Routes>
    </AppLayout>
  );
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <ProtectedRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
