import React from 'react';
import { SystemStatus } from '../types';

const statusColors = {
  active: 'bg-green-500',
  error: 'bg-red-500',
  warning: 'bg-yellow-500',
};

// Update the props type to handle both status and count/capacity
type StatusBadgeProps = {
  status?: SystemStatus | 'active' | 'error' | 'warning';
  count?: number;
  capacity?: number;
};

export default function StatusBadge({ status, count, capacity }: StatusBadgeProps) {
  // If count and capacity are provided, calculate percentage and determine status
  if (count !== undefined && capacity !== undefined) {
    const percentage = capacity > 0 ? (count / capacity) * 100 : 0;
    let statusValue = 'active';
    
    if (percentage > 90) {
      statusValue = 'error';
    } else if (percentage > 70) {
      statusValue = 'warning';
    }
    
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium text-white ${statusColors[statusValue]}`}>
        {count}/{capacity} ({Math.round(percentage)}%)
      </span>
    );
  }
  
  // Handle if status is a string
  if (typeof status === 'string') {
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium text-white ${statusColors[status]}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  }
  
  // Handle if status is a SystemStatus object
  if (status && status.status) {
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium text-white ${statusColors[status.status]}`}>
        {status.status.charAt(0).toUpperCase() + status.status.slice(1)}
      </span>
    );
  }
  
  // Fallback for when neither count/capacity nor valid status is provided
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium text-white bg-gray-500">
      Unknown
    </span>
  );
}