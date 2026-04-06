import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Home from './pages/Home.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import Homecopy from './pages/Homecopy.jsx'
import ProtectedRoute from './components/auth/ProtectedRoute.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import AuthCallback from './pages/AuthCallback.jsx'
import Chatbot from './components/dashboard/Chatbot.jsx'
import { useAppStore } from './stores/useAppStore'

const queryClient = new QueryClient()

// ✅ Pages where chatbot should NOT appear
const PUBLIC_ROUTES = ['/login', '/register', '/auth/callback']

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

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <Homecopy />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
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
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
