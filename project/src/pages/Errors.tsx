import React, { useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, XCircle } from 'lucide-react';

interface SystemError {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  code: string;
  severity: 'high' | 'medium' | 'low';
  resolved: boolean;
  suggestedAction: string;
}

// Mock data - replace with actual API call
const generateMockErrors = (): SystemError[] => {
  return [
    {
      id: '1',
      timestamp: new Date(Date.now() - 300000).toISOString(),
      title: 'Camera Disconnected',
      description: 'Lost connection to the primary camera feed.',
      code: 'ERR_CAM_001',
      severity: 'high',
      resolved: false,
      suggestedAction: 'Check camera connection and power supply.',
    },
    {
      id: '2',
      timestamp: new Date(Date.now() - 900000).toISOString(),
      title: 'Low Frame Rate',
      description: 'Video feed frame rate has dropped below acceptable threshold.',
      code: 'ERR_PERF_002',
      severity: 'medium',
      resolved: false,
      suggestedAction: 'Check system resources and network bandwidth.',
    },
    {
      id: '3',
      timestamp: new Date(Date.now() - 1800000).toISOString(),
      title: 'Detection Service Warning',
      description: 'AI detection service is experiencing delays.',
      code: 'ERR_AI_003',
      severity: 'low',
      resolved: false,
      suggestedAction: 'Monitor system performance and restart if necessary.',
    },
  ];
};

export default function Errors() {
  const [errors, setErrors] = useState<SystemError[]>(generateMockErrors());
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());

  const toggleError = (id: string) => {
    const newExpanded = new Set(expandedErrors);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedErrors(newExpanded);
  };

  const clearResolvedErrors = () => {
    setErrors(errors.filter(error => !error.resolved));
  };

  const markAsResolved = (id: string) => {
    setErrors(errors.map(error => 
      error.id === id ? { ...error, resolved: true } : error
    ));
  };

  const getSeverityColor = (severity: SystemError['severity']) => {
    switch (severity) {
      case 'high':
        return 'bg-red-500';
      case 'medium':
        return 'bg-yellow-500';
      case 'low':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  const activeErrors = errors.filter(error => !error.resolved);

  return (
    <div className="p-6 bg-gray-900 min-h-screen text-white">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center">
            <h1 className="text-2xl font-bold">System Errors</h1>
            {activeErrors.length > 0 && (
              <span className="ml-3 px-2.5 py-0.5 rounded-full text-sm font-medium bg-red-500">
                {activeErrors.length}
              </span>
            )}
          </div>
          <button
            onClick={clearResolvedErrors}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            Clear Resolved
          </button>
        </div>

        <div className="space-y-4">
          {errors.length === 0 ? (
            <div className="text-center py-12 bg-gray-800 rounded-lg">
              <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-lg text-gray-400">No errors to display</p>
            </div>
          ) : (
            errors.map((error) => (
              <div
                key={error.id}
                className={`bg-gray-800 rounded-lg overflow-hidden ${
                  error.resolved ? 'opacity-50' : ''
                }`}
              >
                <div
                  className="px-6 py-4 flex items-center justify-between cursor-pointer"
                  onClick={() => toggleError(error.id)}
                >
                  <div className="flex items-center space-x-4">
                    <div className={`w-2 h-2 rounded-full ${getSeverityColor(error.severity)}`} />
                    <div>
                      <h3 className="font-medium">{error.title}</h3>
                      <p className="text-sm text-gray-400">
                        {new Date(error.timestamp).toLocaleString()} - {error.code}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    {!error.resolved && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsResolved(error.id);
                        }}
                        className="p-1 hover:bg-gray-700 rounded"
                      >
                        <XCircle size={20} />
                      </button>
                    )}
                    {expandedErrors.has(error.id) ? (
                      <ChevronUp size={20} />
                    ) : (
                      <ChevronDown size={20} />
                    )}
                  </div>
                </div>
                {expandedErrors.has(error.id) && (
                  <div className="px-6 py-4 border-t border-gray-700 bg-gray-800">
                    <p className="text-gray-300 mb-4">{error.description}</p>
                    <div className="bg-gray-700 p-4 rounded-lg">
                      <h4 className="text-sm font-medium mb-2">Suggested Action:</h4>
                      <p className="text-sm text-gray-300">{error.suggestedAction}</p>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
