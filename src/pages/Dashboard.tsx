import React, { useState, useEffect, useMemo } from 'react';
import { usePeopleCount } from '../context/PeopleCountContext';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Calendar, Clock, UsersRound, Users, ArrowDownRight, ArrowUpRight, BarChart3, PieChart as PieChartIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import { format, parseISO, subDays, isToday, isYesterday, formatDistanceToNow } from 'date-fns';

// Color configuration for charts
const COLORS = {
  primary: '#3b82f6',
  secondary: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  inactive: '#6b7280',
  gradient: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
  pieColors: ['#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#f97316', '#ef4444'],
  background: {
    dark: '#1f2937',
    card: '#374151',
    highlight: '#4b5563'
  }
};

// Chart display options
type ChartType = 'hourly' | 'daily' | 'pie';
type DateRange = 'today' | 'yesterday' | 'week' | 'month';

export default function Dashboard() {
  const { 
    count, 
    logs, 
    entryExitData, 
    locations, 
    activeLocation, 
    setActiveLocation,
    isApiConnected,
    refreshData,
    isLoadingLogs
  } = usePeopleCount();
  
  const [chartType, setChartType] = useState<ChartType>('hourly');
  const [dateRange, setDateRange] = useState<DateRange>('today');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Get the current location
  const currentLocation = useMemo(() => {
    return locations.find(l => l.id === activeLocation) || locations[0];
  }, [locations, activeLocation]);
  
  // Memoized calculation of statistics
  const stats = useMemo(() => {
    if (!logs.length || !entryExitData.length) {
      return {
        peakCount: count,
        avgCount: count,
        totalEntries: 0,
        totalExits: 0,
        occupancyRate: currentLocation ? (count / currentLocation.capacity) * 100 : 0,
        lastUpdated: new Date().toISOString()
      };
    }
    
    // Calculate date range limits
    const now = new Date();
    let startDate: Date;
    
    switch (dateRange) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'yesterday':
        startDate = subDays(new Date().setHours(0, 0, 0, 0), 1);
        break;
      case 'week':
        startDate = subDays(now, 7);
        break;
      case 'month':
        startDate = subDays(now, 30);
        break;
      default:
        startDate = subDays(now, 1);
    }
    
    // Filter logs by date range
    const filteredLogs = logs.filter(log => {
      if (!log || !log.timestamp) return false;
      const logDate = parseISO(log.timestamp);
      return logDate >= startDate && log.location === activeLocation;
    });
    
    // Filter entry/exit by date range
    const filteredEntryExit = entryExitData.filter(record => {
      if (!record || !record.timestamp) return false;
      const recordDate = parseISO(record.timestamp);
      return recordDate >= startDate && record.location === activeLocation;
    });
    
    // Calculate statistics
    const peakCount = filteredLogs.reduce((max, log) => Math.max(max, log.count), 0);
    const avgCount = filteredLogs.length > 0 
      ? Math.round(filteredLogs.reduce((sum, log) => sum + log.count, 0) / filteredLogs.length) 
      : 0;
    
    const totalEntries = filteredEntryExit.reduce((sum, record) => {
      return record.type === 'entry' ? sum + record.count : sum;
    }, 0);
    
    const totalExits = filteredEntryExit.reduce((sum, record) => {
      return record.type === 'exit' ? sum + record.count : sum;
    }, 0);
    
    const occupancyRate = currentLocation 
      ? Math.min(100, Math.round((count / currentLocation.capacity) * 100)) 
      : 0;
    
    const lastUpdated = filteredLogs.length > 0 
      ? filteredLogs[0].timestamp 
      : new Date().toISOString();
    
    return {
      peakCount,
      avgCount,
      totalEntries,
      totalExits,
      occupancyRate,
      lastUpdated
    };
  }, [logs, entryExitData, activeLocation, dateRange, count, currentLocation]);
  
  // Generate chart data based on logs
  const chartData = useMemo(() => {
    if (!logs.length) return [];
    
    // Calculate date range limits
    const now = new Date();
    let startDate: Date;
    
    switch (dateRange) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'yesterday':
        startDate = subDays(new Date().setHours(0, 0, 0, 0), 1);
        break;
      case 'week':
        startDate = subDays(now, 7);
        break;
      case 'month':
        startDate = subDays(now, 30);
        break;
      default:
        startDate = subDays(now, 1);
    }
    
    // Filter logs by date range and location
    const filteredLogs = logs.filter(log => {
      if (!log || !log.timestamp) return false;
      const logDate = parseISO(log.timestamp);
      return logDate >= startDate && log.location === activeLocation;
    });
    
    // Different aggregation based on chart type
    if (chartType === 'hourly') {
      const hourlyData: Record<string, { hour: string, count: number, time: string }> = {};
      
      filteredLogs.forEach(log => {
        if (!log || !log.timestamp) return;
        const date = parseISO(log.timestamp);
        const hour = format(date, 'HH:00');
        const timeKey = format(date, 'yyyy-MM-dd HH');
        
        if (!hourlyData[timeKey]) {
          hourlyData[timeKey] = {
            hour,
            count: log.count,
            time: format(date, 'MMM dd, HH:00')
          };
        } else {
          // We'll use max count for the hour for better visualization
          hourlyData[timeKey].count = Math.max(hourlyData[timeKey].count, log.count);
        }
      });
      
      return Object.values(hourlyData).sort((a, b) => a.time.localeCompare(b.time));
    } else if (chartType === 'daily') {
      const dailyData: Record<string, { day: string, count: number, date: string }> = {};
      
      filteredLogs.forEach(log => {
        if (!log || !log.timestamp) return;
        const date = parseISO(log.timestamp);
        const day = format(date, 'MM/dd');
        const dateKey = format(date, 'yyyy-MM-dd');
        
        if (!dailyData[dateKey]) {
          dailyData[dateKey] = {
            day,
            count: log.count,
            date: format(date, 'MMM dd')
          };
        } else {
          // We'll use max count for the day for better visualization
          dailyData[dateKey].count = Math.max(dailyData[dateKey].count, log.count);
        }
      });
      
      return Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));
    } else if (chartType === 'pie') {
      // Prepare data for occupancy distribution
      // Group counts into ranges: 0, 1-25%, 26-50%, 51-75%, 76-99%, 100%+
      const occupancyDistribution = [
        { name: 'Empty', value: 0 },
        { name: '1-25%', value: 0 },
        { name: '26-50%', value: 0 },
        { name: '51-75%', value: 0 },
        { name: '76-99%', value: 0 },
        { name: '100%+', value: 0 }
      ];
      
      if (currentLocation) {
        const capacity = currentLocation.capacity;
        
        filteredLogs.forEach(log => {
          const percentage = (log.count / capacity) * 100;
          
          if (log.count === 0) {
            occupancyDistribution[0].value++;
          } else if (percentage <= 25) {
            occupancyDistribution[1].value++;
          } else if (percentage <= 50) {
            occupancyDistribution[2].value++;
          } else if (percentage <= 75) {
            occupancyDistribution[3].value++;
          } else if (percentage <= 99) {
            occupancyDistribution[4].value++;
          } else {
            occupancyDistribution[5].value++;
          }
        });
      }
      
      // Filter out zero values
      return occupancyDistribution.filter(item => item.value > 0);
    }
    
    return [];
  }, [logs, chartType, dateRange, activeLocation, currentLocation]);
  
  // Handle refreshing data
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshData();
    setIsRefreshing(false);
  };

  // Auto-refresh on initial load
  useEffect(() => {
    if (isApiConnected) {
      handleRefresh();
    }
  }, [isApiConnected]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Format time ago from timestamp
  const formatTimeAgo = (timestamp: string) => {
    if (!timestamp) return 'Unknown';
    const date = parseISO(timestamp);
    
    if (isToday(date)) {
      return `Today, ${format(date, 'h:mm a')}`;
    } else if (isYesterday(date)) {
      return `Yesterday, ${format(date, 'h:mm a')}`;
    } else {
      return formatDistanceToNow(date, { addSuffix: true });
    }
  };

  return (
    <div className="p-4 bg-gray-900 min-h-screen text-white">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
          
          <div className="flex flex-wrap gap-2">
            {/* Location Selector */}
            <select
              className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm"
              value={activeLocation}
              onChange={(e) => setActiveLocation(e.target.value)}
            >
              {locations.map(location => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
            
            {/* Date Range Filter */}
            <div className="flex">
              <button
                onClick={() => setDateRange('today')}
                className={`px-3 py-1.5 text-sm rounded-l-lg ${
                  dateRange === 'today' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setDateRange('yesterday')}
                className={`px-3 py-1.5 text-sm ${
                  dateRange === 'yesterday' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Yesterday
              </button>
              <button
                onClick={() => setDateRange('week')}
                className={`px-3 py-1.5 text-sm ${
                  dateRange === 'week' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setDateRange('month')}
                className={`px-3 py-1.5 text-sm rounded-r-lg ${
                  dateRange === 'month' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Month
              </button>
            </div>
            
            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || isLoadingLogs}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm flex items-center gap-2 transition-colors"
            >
              {isRefreshing ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Refresh</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Current Occupancy Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex justify-between">
              <div>
                <p className="text-gray-400 text-sm">Current Occupancy</p>
                <h3 className="text-3xl font-bold">{count}</h3>
                <div className="flex items-center mt-1">
                  <StatusBadge status={count > 0 ? 'active' : 'warning'} />
                </div>
              </div>
              <div className="bg-blue-600 bg-opacity-20 p-3 rounded-lg">
                <UsersRound size={24} className="text-blue-500" />
              </div>
            </div>
            {currentLocation && (
              <div className="mt-3">
                <div className="w-full bg-gray-700 rounded-full h-1.5">
                  <div 
                    className={`h-1.5 rounded-full ${
                      count / currentLocation.capacity > 1 
                        ? 'bg-red-600' 
                        : count / currentLocation.capacity > 0.8 
                          ? 'bg-yellow-500' 
                          : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(100, (count / currentLocation.capacity) * 100)}%` }}
                  ></div>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {Math.round((count / currentLocation.capacity) * 100)}% of capacity
                </p>
              </div>
            )}
          </div>
          
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex justify-between">
              <div>
                <p className="text-gray-400 text-sm">Peak Count</p>
                <h3 className="text-3xl font-bold">{stats.peakCount}</h3>
                <p className="text-xs text-gray-400 mt-1">
                  {dateRange === 'today' ? 'Today' : 
                   dateRange === 'yesterday' ? 'Yesterday' : 
                   dateRange === 'week' ? 'Last 7 days' : 'Last 30 days'}
                </p>
              </div>
              <div className="bg-green-600 bg-opacity-20 p-3 rounded-lg">
                <ArrowUpRight size={24} className="text-green-500" />
              </div>
            </div>
          </div>
          
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex justify-between">
              <div>
                <p className="text-gray-400 text-sm">Average Count</p>
                <h3 className="text-3xl font-bold">{stats.avgCount}</h3>
                <p className="text-xs text-gray-400 mt-1">
                  {dateRange === 'today' ? 'Today' : 
                   dateRange === 'yesterday' ? 'Yesterday' : 
                   dateRange === 'week' ? 'Last 7 days' : 'Last 30 days'}
                </p>
              </div>
              <div className="bg-yellow-600 bg-opacity-20 p-3 rounded-lg">
                <Users size={24} className="text-yellow-500" />
              </div>
            </div>
          </div>
          
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex justify-between">
              <div>
                <p className="text-gray-400 text-sm">Entries vs Exits</p>
                <h3 className="text-3xl font-bold">{stats.totalEntries - stats.totalExits}</h3>
                <div className="flex text-xs text-gray-400 mt-1 gap-3">
                  <span className="flex items-center">
                    <ArrowUpRight size={12} className="text-green-500 mr-1" />
                    {stats.totalEntries}
                  </span>
                  <span className="flex items-center">
                    <ArrowDownRight size={12} className="text-red-500 mr-1" />
                    {stats.totalExits}
                  </span>
                </div>
              </div>
              <div className="bg-purple-600 bg-opacity-20 p-3 rounded-lg">
                <Clock size={24} className="text-purple-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Chart Section */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
            <h2 className="text-lg font-semibold">Occupancy Trends</h2>
            
            <div className="flex">
              <button
                onClick={() => setChartType('hourly')}
                className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-l-lg ${
                  chartType === 'hourly' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <BarChart3 size={16} />
                Hourly
              </button>
              <button
                onClick={() => setChartType('daily')}
                className={`flex items-center gap-1 px-3 py-1.5 text-sm ${
                  chartType === 'daily' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <Calendar size={16} />
                Daily
              </button>
              <button
                onClick={() => setChartType('pie')}
                className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-r-lg ${
                  chartType === 'pie' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <PieChartIcon size={16} />
                Distribution
              </button>
            </div>
          </div>
          
          <div className="h-80">
            {isLoadingLogs ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <svg className="animate-spin h-8 w-8 text-blue-500 mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p className="text-gray-400">Loading chart data...</p>
                </div>
              </div>
            ) : chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-gray-400">No data available for this time period</p>
                  <p className="text-sm text-gray-500 mt-1">Try selecting a different date range</p>
                </div>
              </div>
            ) : chartType === 'pie' ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    labelLine={true}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={120}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS.pieColors[index % COLORS.pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} readings`, 'Count']} />
                </PieChart>
              </ResponsiveContainer>
            ) : chartType === 'hourly' ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" />
                  <XAxis 
                    dataKey="hour" 
                    tick={{ fill: '#9CA3AF', fontSize: 12 }} 
                    axisLine={{ stroke: '#4B5563' }}
                    tickLine={{ stroke: '#4B5563' }}
                  />
                  <YAxis 
                    tick={{ fill: '#9CA3AF', fontSize: 12 }} 
                    axisLine={{ stroke: '#4B5563' }}
                    tickLine={{ stroke: '#4B5563' }}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '0.375rem' }}
                    formatter={(value) => [`${value} people`, 'Count']}
                    labelFormatter={(value) => `${value}`}
                  />
                  <Bar 
                    dataKey="count" 
                    fill={COLORS.primary} 
                    radius={[4, 4, 0, 0]}
                    maxBarSize={60}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" />
                  <XAxis 
                    dataKey="day" 
                    tick={{ fill: '#9CA3AF', fontSize: 12 }} 
                    axisLine={{ stroke: '#4B5563' }}
                    tickLine={{ stroke: '#4B5563' }}
                  />
                  <YAxis 
                    tick={{ fill: '#9CA3AF', fontSize: 12 }} 
                    axisLine={{ stroke: '#4B5563' }}
                    tickLine={{ stroke: '#4B5563' }}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '0.375rem' }}
                    formatter={(value) => [`${value} people`, 'Count']}
                    labelFormatter={(value) => `${value}`}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="count" 
                    stroke={COLORS.primary} 
                    strokeWidth={3}
                    dot={{ r: 4, fill: COLORS.primary, strokeWidth: 0 }}
                    activeDot={{ r: 6, fill: COLORS.primary, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">Recent Entries & Exits</h2>
            
            {entryExitData.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-400">No entry/exit data recorded yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {entryExitData.slice(0, 5).map((record, index) => (
                  <div key={index} className="flex items-center p-2 bg-gray-700 rounded-lg">
                    <div className={`p-2 rounded-lg ${record.type === 'entry' ? 'bg-green-600 bg-opacity-20' : 'bg-red-600 bg-opacity-20'}`}>
                      {record.type === 'entry' ? (
                        <ArrowUpRight size={20} className="text-green-500" />
                      ) : (
                        <ArrowDownRight size={20} className="text-red-500" />
                      )}
                    </div>
                    <div className="ml-3">
                      <div className="flex items-center">
                        <p className="font-medium">
                          {record.type === 'entry' ? 'Entry' : 'Exit'}: {record.count} {record.count === 1 ? 'person' : 'people'}
                        </p>
                      </div>
                      <p className="text-sm text-gray-400">{formatTimeAgo(record.timestamp)}</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-sm font-medium">Current: {record.currentOccupancy}</p>
                      {currentLocation && (
                        <p className="text-xs text-gray-400">
                          {Math.round((record.currentOccupancy / currentLocation.capacity) * 100)}% of capacity
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                
                <div className="text-center pt-2">
                  <Link to="/logs" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                    View all activity →
                  </Link>
                </div>
              </div>
            )}
          </div>
          
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">Location Status</h2>
            
            {locations.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-400">No locations configured</p>
                <Link to="/config" className="text-sm text-blue-400 hover:text-blue-300 transition-colors mt-2 inline-block">
                  Add locations →
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {locations.map(location => {
                  // Find the most recent count for this location
                  const locationLogs = logs.filter(log => log && log.location === location.id);
                  const latestCount = locationLogs.length > 0 ? locationLogs[0].count : 0;
                  const occupancyPercent = Math.round((latestCount / location.capacity) * 100);
                  
                  return (
                    <div key={location.id} className={`p-3 rounded-lg ${
                      location.id === activeLocation ? 'bg-blue-900 bg-opacity-30 border border-blue-700' : 'bg-gray-700'
                    }`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium">
                            {location.name}
                            {location.id === activeLocation && (
                              <span className="ml-2 text-xs bg-blue-600 px-2 py-0.5 rounded">Active</span>
                            )}
                          </h3>
                          <p className="text-sm text-gray-400">Capacity: {location.capacity}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{latestCount} people</p>
                          <p className="text-sm text-gray-400">{occupancyPercent}% full</p>
                        </div>
                      </div>
                      
                      <div className="mt-2">
                        <div className="w-full bg-gray-600 rounded-full h-1.5">
                          <div 
                            className={`h-1.5 rounded-full ${
                              occupancyPercent > 100 
                                ? 'bg-red-600' 
                                : occupancyPercent > 80 
                                  ? 'bg-yellow-500' 
                                  : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(100, occupancyPercent)}%` }}
                          ></div>
                        </div>
                      </div>
                      
                      {location.id !== activeLocation && (
                        <button
                          onClick={() => setActiveLocation(location.id)}
                          className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          Switch to this location
                        </button>
                      )}
                    </div>
                  );
                })}
                
                <div className="text-center pt-2">
                  <Link to="/config" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                    Manage locations →
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="text-right text-sm text-gray-500">
          <p>
            Last updated: {formatTimeAgo(stats.lastUpdated)}
            {!isApiConnected && (
              <span className="ml-2 text-amber-500">(Offline mode)</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}