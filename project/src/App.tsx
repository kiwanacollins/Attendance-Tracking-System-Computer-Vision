import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import LiveFeed from './pages/LiveFeed';
import Dashboard from './pages/Dashboard';
import Config from './pages/Config';
import Logs from './pages/Logs';
import Errors from './pages/Errors';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<LiveFeed />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/config" element={<Config />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/errors" element={<Errors />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;