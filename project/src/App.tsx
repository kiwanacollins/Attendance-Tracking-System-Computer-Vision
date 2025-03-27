import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import LiveFeed from './pages/LiveFeed';
import Dashboard from './pages/Dashboard';
import Config from './pages/Config';
import Logs from './pages/Logs';
import Errors from './pages/Errors';
import Students from './pages/Students';
import Courses from './pages/Courses';
import { PeopleCountProvider } from './context/PeopleCountContext';
import { StudentProvider } from './context/StudentContext';
import { CourseProvider } from './context/CourseContext';
import { AttendanceProvider } from './context/AttendanceContext';

function App() {
  return (
    <StudentProvider>
      <CourseProvider>
        <AttendanceProvider>
          <PeopleCountProvider>
            <BrowserRouter>
              <Layout>
                <Routes>
                  <Route path="/" element={<LiveFeed />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/config" element={<Config />} />
                  <Route path="/logs" element={<Logs />} />
                  <Route path="/errors" element={<Errors />} />
                  <Route path="/students" element={<Students />} />
                  <Route path="/courses" element={<Courses />} />
                </Routes>
              </Layout>
            </BrowserRouter>
          </PeopleCountProvider>
        </AttendanceProvider>
      </CourseProvider>
    </StudentProvider>
  );
}

export default App;