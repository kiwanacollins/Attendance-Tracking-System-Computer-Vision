import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Layout from './components/Layout';
import { PeopleCountProvider } from './context/PeopleCountContext';

// Lazy load components for code splitting
const LiveFeed = lazy(() => import('./pages/LiveFeed'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Config = lazy(() => import('./pages/Config'));
const Logs = lazy(() => import('./pages/Logs'));
const Errors = lazy(() => import('./pages/Errors'));

// Loading fallback component
const LoadingFallback = () => (
  <div className="flex items-center justify-center h-full bg-gray-900 text-white">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mr-3"></div>
    <span>Loading...</span>
  </div>
);

// Define routes with the new API
const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout>{/* Add children here */}</Layout>,
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
], {
  future: {
    v7_relativeSplatPath: true,
    v7_startTransition: true
  }
});

function App() {
  return (
    <PeopleCountProvider>
      <RouterProvider router={router} />
    </PeopleCountProvider>
  );
}

export default App;