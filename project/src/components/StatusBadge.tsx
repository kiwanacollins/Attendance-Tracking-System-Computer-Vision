import React from 'react';
import { SystemStatus } from '../types';

const statusColors = {
  active: 'bg-green-500',
  error: 'bg-red-500',
  warning: 'bg-yellow-500',
};

type StatusBadgeProps = {
  status: SystemStatus | 'active' | 'error' | 'warning';
  text?: string;
};

export default function StatusBadge({ status, text }: StatusBadgeProps) {
  // Handle both object and string status
  const statusType = typeof status === 'string' ? status : status.status;
  const message = text || (typeof status === 'string' ? 
    statusType.charAt(0).toUpperCase() + statusType.slice(1) : 
    status.message);
  
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium text-white ${statusColors[statusType]}`}>
      {message}
    </span>
  );
}