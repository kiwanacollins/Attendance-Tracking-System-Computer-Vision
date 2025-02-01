import React from 'react';
import { SystemStatus } from '../types';

const statusColors = {
  active: 'bg-green-500',
  error: 'bg-red-500',
  warning: 'bg-yellow-500',
};

export default function StatusBadge({ status }: { status: SystemStatus }) {
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium text-white ${statusColors[status.status]}`}>
      {status.status.charAt(0).toUpperCase() + status.status.slice(1)}
    </span>
  );
}