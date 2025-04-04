import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import Layout from './components/Layout';
import { PeopleCountProvider } from './context/PeopleCountContext';
import { AuthProvider, useAuth } from './context/AuthContext';

// Lazy load components for code splitting
const LiveFeed = lazy(() => import('./pages/LiveFeed'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Config = lazy(() => import('./pages/Config'));
const Logs = lazy(() => import('./pages/Logs'));
const Errors = lazy(() => import('./pages/Errors'));
const Login = lazy(() => import('./pages/Login'));

// Loading fallback component
const LoadingFallback = () => (
  <div className="flex items-center justify-center h-full bg-gray-900 text-white">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mr-3"></div>
    <span>Loading...</span>
  </div>
);

// Protected route component that uses AuthContext
const ProtectedRoute = () => {
  const { isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <Outlet />;
};

// App component that sets up routes
function AppRoutes() {
  // Create router with routes
  const router = createBrowserRouter([
    {
      path: "/login",
      element: <Suspense fallback={<LoadingFallback />}><Login /></Suspense>
    },
    {
      path: "/",
      element: <ProtectedRoute />,
      children: [
        {
          element: <Layout />,
          children: [
            {
              index: true,
              element: <Suspense fallback={<LoadingFallback />}><LiveFeed /></Suspense>
            },
            {
              path: "dashboard",
              element: <Suspense fallback={<LoadingFallback />}><Dashboard /></Suspense>
            },
            {
              path: "config",
              element: <Suspense fallback={<LoadingFallback />}><Config /></Suspense>
            },
            {
              path: "logs",
              element: <Suspense fallback={<LoadingFallback />}><Logs /></Suspense>
            },
            {
              path: "errors",
              element: <Suspense fallback={<LoadingFallback />}><Errors /></Suspense>
            }
          ]
        }
      ]
    }
  ], {
    future: {
      v7_relativeSplatPath: true,
      v7_startTransition: true
    }
  });

  return <RouterProvider router={router} />;
}

// Main App component that wraps everything with providers
function App() {
  return (
    <PeopleCountProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </PeopleCountProvider>
  );
}

export default App;