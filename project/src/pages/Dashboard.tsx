import React, { useState, useEffect } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import { RefreshCw, Calendar } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { usePeopleCount } from '../context/PeopleCountContext';
import { useAttendance } from '../context/AttendanceContext';
import { useCourses } from '../context/CourseContext';
import { useStudents } from '../context/StudentContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function Dashboard() {
  const { count } = usePeopleCount();
  const { sessions } = useAttendance();
  const { courses } = useCourses();
  const { students } = useStudents();
  const [historicalData, setHistoricalData] = useState<number[]>([]);
  const [timeLabels, setTimeLabels] = useState<string[]>([]);
  const [status, setStatus] = useState({ status: 'active' as const, message: 'System operating normally' });
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  // Get today's date in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    // Update historical data every second
    const interval = setInterval(() => {
      // Update historical data with the current count
      setHistoricalData(prev => {
        const newData = [...prev, count];
        return newData.slice(-10); // Keep last 10 data points
      });
      
      // Update time labels
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { 
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      setTimeLabels(prev => {
        const newLabels = [...prev, timeStr];
        return newLabels.slice(-10); // Keep last 10 labels
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [count]);

  // Filter sessions for the selected date
  const sessionsForSelectedDate = sessions.filter(
    session => session.date === selectedDate
  );
  
  // Calculate attendance statistics
  const getAttendanceStats = () => {
    if (sessionsForSelectedDate.length === 0) {
      return {
        totalSessions: 0,
        totalStudentsPresent: 0,
        totalStudentsLate: 0,
        attendanceRate: 0
      };
    }
    
    const allRecords = sessionsForSelectedDate.flatMap(s => s.records);
    const uniqueStudents = new Set(allRecords.map(r => r.studentId));
    const lateStudents = allRecords.filter(r => r.status === 'late');
    
    // Attendance rate = unique students present / total students
    const attendanceRate = students.length > 0 
      ? Math.round((uniqueStudents.size / students.length) * 100) 
      : 0;
    
    return {
      totalSessions: sessionsForSelectedDate.length,
      totalStudentsPresent: uniqueStudents.size,
      totalStudentsLate: lateStudents.length,
      attendanceRate
    };
  };
  
  // Generate course attendance data for chart
  const getCourseAttendanceData = () => {
    const courseLabels = courses.map(c => c.name);
    const presentData = courses.map(course => {
      const courseSessions = sessionsForSelectedDate.filter(s => s.courseId === course.id);
      if (courseSessions.length === 0) return 0;
      
      const uniquePresentStudents = new Set();
      courseSessions.forEach(session => {
        session.records.forEach(record => {
          if (record.status === 'present' || record.status === 'late') {
            uniquePresentStudents.add(record.studentId);
          }
        });
      });
      
      return uniquePresentStudents.size;
    });
    
    const lateData = courses.map(course => {
      const courseSessions = sessionsForSelectedDate.filter(s => s.courseId === course.id);
      if (courseSessions.length === 0) return 0;
      
      const uniqueLateStudents = new Set();
      courseSessions.forEach(session => {
        session.records.forEach(record => {
          if (record.status === 'late') {
            uniqueLateStudents.add(record.studentId);
          }
        });
      });
      
      return uniqueLateStudents.size;
    });
    
    return { courseLabels, presentData, lateData };
  };
  
  const stats = getAttendanceStats();
  const { courseLabels, presentData, lateData } = getCourseAttendanceData();
  
  const chartData = {
    labels: timeLabels,
    datasets: [
      {
        label: 'People Count',
        data: historicalData,
        fill: true,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4
      }
    ]
  };
  
  const attendanceChartData = {
    labels: courseLabels,
    datasets: [
      {
        label: 'Present',
        data: presentData,
        backgroundColor: 'rgba(34, 197, 94, 0.7)',
      },
      {
        label: 'Late',
        data: lateData,
        backgroundColor: 'rgba(234, 179, 8, 0.7)',
      }
    ]
  };
  
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.7)'
        }
      },
      x: {
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.7)'
        }
      }
    }
  };
  
  const attendanceChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: 'rgba(255, 255, 255, 0.7)'
        }
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.7)'
        }
      },
      x: {
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.7)',
          autoSkip: false,
          maxRotation: 45,
          minRotation: 45
        }
      }
    }
  };

  const handleRefresh = () => {
    // Implement refresh logic here
    console.log('Refreshing dashboard data...');
  };

  return (
    <div className="p-6 bg-gray-900 min-h-screen text-white">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <button
          onClick={handleRefresh}
          className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
        >
          <RefreshCw size={20} />
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Current Count</h2>
          <div className="text-5xl font-bold text-blue-500 mb-4">{count}</div>
          <StatusBadge status={status} />
        </div>
        
        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">System Statistics</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Average Count (10m):</span>
              <span className="font-semibold">
                {Math.round(historicalData.reduce((a, b) => a + b, 0) / historicalData.length || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Peak Count (10m):</span>
              <span className="font-semibold">
                {Math.max(...historicalData, 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Minimum Count (10m):</span>
              <span className="font-semibold">
                {Math.min(...historicalData, 0)}
              </span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="bg-gray-800 p-6 rounded-lg mb-6">
        <h2 className="text-lg font-semibold mb-4">Count Trend (Last 10 minutes)</h2>
        <div className="h-[300px]">
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>
      
      {/* Attendance Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Attendance Dashboard</h2>
          <div className="flex items-center space-x-2">
            <Calendar size={18} />
            <input
              type="date"
              value={selectedDate}
              max={today}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white"
            />
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-sm uppercase text-gray-400 mb-2">Total Sessions</h3>
          <div className="text-3xl font-bold text-blue-500">{stats.totalSessions}</div>
        </div>
        
        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-sm uppercase text-gray-400 mb-2">Students Present</h3>
          <div className="text-3xl font-bold text-green-500">{stats.totalStudentsPresent}</div>
        </div>
        
        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-sm uppercase text-gray-400 mb-2">Late Arrivals</h3>
          <div className="text-3xl font-bold text-yellow-500">{stats.totalStudentsLate}</div>
        </div>
        
        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-sm uppercase text-gray-400 mb-2">Attendance Rate</h3>
          <div className="text-3xl font-bold text-purple-500">{stats.attendanceRate}%</div>
        </div>
      </div>
      
      <div className="bg-gray-800 p-6 rounded-lg">
        <h2 className="text-lg font-semibold mb-4">Course Attendance</h2>
        {courses.length > 0 ? (
          <div className="h-[400px]">
            <Bar data={attendanceChartData} options={attendanceChartOptions} />
          </div>
        ) : (
          <div className="text-center text-gray-400 py-10">
            No courses available. Add courses to see attendance data.
          </div>
        )}
      </div>
    </div>
  );
}