/**
 * App.tsx
 * ----------------------------------------------------------------------------
 * Application entry. Wires up:
 *   • React Query (data caching)
 *   • Toaster + Sonner notifications
 *   • Tooltip provider
 *   • Auth / Language / Literacy contexts
 *   • Router with all WelfareConnect routes (public + protected).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { LiteracyProvider } from "@/contexts/LiteracyContext";

import Layout from "@/components/Layout";
import ProtectedRoute from "@/components/ProtectedRoute";

import Home from "@/pages/Home";
import Eligibility from "@/pages/Eligibility";
import Schemes from "@/pages/Schemes";
import SchemeDetail from "@/pages/SchemeDetail";
import NgoPartners from "@/pages/NgoPartners";
import Status from "@/pages/Status";
import Notifications from "@/pages/Notifications";
import Profile from "@/pages/Profile";
import Dashboard from "@/pages/Dashboard";
import Auth from "@/pages/Auth";
import AuthCallback from "@/pages/AuthCallback";
import ResetPassword from "@/pages/ResetPassword";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <LiteracyProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route element={<Layout />}>
                  {/* Public routes */}
                  <Route path="/" element={<Home />} />
                  <Route path="/eligibility" element={<Eligibility />} />
                  <Route path="/schemes" element={<Schemes />} />
                  <Route path="/schemes/:schemeId" element={<SchemeDetail />} />
                  <Route path="/schemes/:schemeId/ngos" element={<NgoPartners />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route path="/reset-password" element={<ResetPassword />} />

                  {/* Protected routes — require login */}
                  <Route path="/status"        element={<ProtectedRoute><Status /></ProtectedRoute>} />
                  <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
                  <Route path="/profile"       element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                  <Route path="/dashboard"     element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

                  {/* Catch-all 404 */}
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </LiteracyProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
