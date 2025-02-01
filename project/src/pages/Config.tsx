import React, { useState } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import type { SystemConfig } from '../types';

const CAMERA_OPTIONS = [
  { id: 'default', label: 'Default Camera' },
  { id: 'external', label: 'External Webcam' },
];

const SENSITIVITY_LEVELS = [
  { value: 0.3, label: 'Low' },
  { value: 0.5, label: 'Medium' },
  { value: 0.8, label: 'High' },
];

const LOG_FREQUENCIES = [
  { value: 60, label: 'Every minute' },
  { value: 300, label: 'Every 5 minutes' },
  { value: 600, label: 'Every 10 minutes' },
  { value: 1800, label: 'Every 30 minutes' },
];

export default function Config() {
  const [config, setConfig] = useState<SystemConfig>({
    camera: 'default',
    sensitivity: 0.5,
    enableLogging: true,
    logFrequency: 300,
  });
  const [isTesting, setIsTesting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  const handleTestCamera = async () => {
    setIsTesting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { deviceId: config.camera }
      });
      // Stop the stream after testing
      stream.getTracks().forEach(track => track.stop());
      alert('Camera test successful!');
    } catch (error) {
      alert('Camera test failed. Please check your permissions and try again.');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="p-6 bg-gray-900 min-h-screen text-white">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">System Configuration</h1>
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
              saveStatus === 'saving'
                ? 'bg-gray-600 cursor-not-allowed'
                : saveStatus === 'saved'
                ? 'bg-green-600'
                : saveStatus === 'error'
                ? 'bg-red-600'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            <Save size={20} className="mr-2" />
            {saveStatus === 'saving'
              ? 'Saving...'
              : saveStatus === 'saved'
              ? 'Saved!'
              : saveStatus === 'error'
              ? 'Error!'
              : 'Save Changes'}
          </button>
        </div>

        <div className="space-y-8">
          {/* Camera Settings */}
          <section className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Camera Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Select Camera
                </label>
                <div className="flex gap-4">
                  <select
                    value={config.camera}
                    onChange={(e) => setConfig({ ...config, camera: e.target.value })}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                  >
                    {CAMERA_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleTestCamera}
                    disabled={isTesting}
                    className="flex items-center px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    <RefreshCw size={20} className={`mr-2 ${isTesting ? 'animate-spin' : ''}`} />
                    Test Camera
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Detection Settings */}
          <section className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Detection Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Detection Sensitivity
                </label>
                <select
                  value={config.sensitivity}
                  onChange={(e) => setConfig({ ...config, sensitivity: parseFloat(e.target.value) })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                >
                  {SENSITIVITY_LEVELS.map((level) => (
                    <option key={level.value} value={level.value}>
                      {level.label} ({(level.value * 100).toFixed(0)}%)
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-sm text-gray-400">
                  Higher sensitivity may increase false positives, while lower sensitivity may miss some detections.
                </p>
              </div>
            </div>
          </section>

          {/* Logging Settings */}
          <section className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Logging Settings</h2>
            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enableLogging"
                  checked={config.enableLogging}
                  onChange={(e) => setConfig({ ...config, enableLogging: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="enableLogging" className="ml-2 text-sm font-medium">
                  Enable System Logging
                </label>
              </div>

              {config.enableLogging && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Log Frequency
                  </label>
                  <select
                    value={config.logFrequency}
                    onChange={(e) => setConfig({ ...config, logFrequency: parseInt(e.target.value, 10) })}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
                  >
                    {LOG_FREQUENCIES.map((freq) => (
                      <option key={freq.value} value={freq.value}>
                        {freq.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}