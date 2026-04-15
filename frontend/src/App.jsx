import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import FilesPage from './pages/FilesPage.jsx'
import ProcessPage from './pages/ProcessPage.jsx'
import QualityPage from './pages/QualityPage.jsx'
import DriftPage from './pages/DriftPage.jsx'
import ChatbotPage from './pages/ChatbotPage.jsx'
import VersionsPage from './pages/VersionsPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import ProtectedRoute from './components/auth/ProtectedRoute.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import AuthCallback from './pages/AuthCallback.jsx'
import Chatbot from './components/dashboard/Chatbot.jsx'
import DiqAppLayout from './components/layout/DiqAppLayout.jsx'
import { useAppStore } from './stores/useAppStore'
import './styles/design-tokens.css'

const queryClient = new QueryClient()

// ✅ Pages where floating chatbot should NOT appear
const PUBLIC_ROUTES = ['/login', '/register', '/auth/callback', '/chatbot']

// Wrapper component to apply layout to app pages
function AppWithLayout({ children, pageTitle, pageSubtitle, showTopbar = true }) {
  return (
    <DiqAppLayout
      pageTitle={pageTitle}
      pageSubtitle={pageSubtitle}
      showTopbar={showTopbar}
    >
      {children}
    </DiqAppLayout>
  )
}

function AppContent() {
  const location = useLocation()
  const selectedFile = useAppStore((s) => s.selectedFile)
  const selectedFilename = selectedFile?.filename || selectedFile?.name || null

  // Only show chatbot on authenticated pages
  const showChatbot = !PUBLIC_ROUTES.includes(location.pathname)

  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Files Page */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppWithLayout 
                pageTitle="My Files" 
                pageSubtitle="3 datasets uploaded · 8 cleaned files"
              >
                <FilesPage />
              </AppWithLayout>
            </ProtectedRoute>
          }
        />

        {/* Processing Page */}
        <Route
          path="/process"
          element={
            <ProtectedRoute>
              <AppWithLayout 
                pageTitle="Clean & Process" 
                pageSubtitle="Data preprocessing pipeline"
              >
                <ProcessPage />
              </AppWithLayout>
            </ProtectedRoute>
          }
        />

        {/* Dashboard Page */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AppWithLayout 
                pageTitle="Dashboard" 
                pageSubtitle="Auto-generated analytics"
              >
                <DashboardPage />
              </AppWithLayout>
            </ProtectedRoute>
          }
        />

        {/* Data Quality Page */}
        <Route
          path="/quality"
          element={
            <ProtectedRoute>
              <AppWithLayout 
                pageTitle="Data Quality" 
                pageSubtitle="Quality metrics and recommendations"
              >
                <QualityPage />
              </AppWithLayout>
            </ProtectedRoute>
          }
        />

        {/* Drift Detection Page */}
        <Route
          path="/drift"
          element={
            <ProtectedRoute>
              <AppWithLayout 
                pageTitle="Drift Detection" 
                pageSubtitle="Compare datasets for drift"
              >
                <DriftPage />
              </AppWithLayout>
            </ProtectedRoute>
          }
        />

        {/* Chatbot Page */}
        <Route
          path="/chatbot"
          element={
            <ProtectedRoute>
              <AppWithLayout 
                pageTitle="AI Chatbot" 
                pageSubtitle="Ask questions about your data"
              >
                <ChatbotPage />
              </AppWithLayout>
            </ProtectedRoute>
          }
        />

        {/* Versions Page */}
        <Route
          path="/versions"
          element={
            <ProtectedRoute>
              <AppWithLayout 
                pageTitle="Dataset Versions" 
                pageSubtitle="Track all dataset transformations"
              >
                <VersionsPage />
              </AppWithLayout>
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* ✅ Chatbot only shown on authenticated pages */}
      {showChatbot && <Chatbot filename={selectedFilename} />}
    </>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AppContent />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
