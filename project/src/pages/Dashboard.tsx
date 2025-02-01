import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import { RefreshCw } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function Dashboard() {
  const [count, setCount] = useState(0);
  const [historicalData, setHistoricalData] = useState<number[]>([]);
  const [timeLabels, setTimeLabels] = useState<string[]>([]);
  const [status, setStatus] = useState({ status: 'active' as const, message: 'System operating normally' });

  useEffect(() => {
    // Update count every second
    const interval = setInterval(() => {
      const newCount = Math.floor(Math.random() * 10); // Simulated count, replace with actual data
      setCount(newCount);
      
      // Update historical data
      setHistoricalData(prev => {
        const newData = [...prev, newCount];
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
  }, []);

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

      <div className="bg-gray-800 p-6 rounded-lg">
        <h2 className="text-lg font-semibold mb-4">Count Trend (Last 10 minutes)</h2>
        <div className="h-[400px]">
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>
    </div>
  );
}