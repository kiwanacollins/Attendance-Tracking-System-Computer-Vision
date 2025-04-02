import React, { useState, useEffect, memo } from 'react';
import { Save, RefreshCw, Plus, X } from 'lucide-react';
import type { SystemConfig, LocationData } from '../types';
import { usePeopleCount } from '../context/PeopleCountContext';
import { v4 as uuidv4 } from 'uuid';

const CAMERA_OPTIONS = [
  { id: 'default', label: 'Default Camera' },
  { id: 'external', label: 'External Webcam' },
  { id: 'raspi', label: 'Raspberry Pi Camera Module' },
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

// Memoized section component for better performance
const ConfigSection = memo(({ title, children }) => (
  <section className="bg-gray-800 p-6 rounded-lg mb-6">
    <h2 className="text-xl font-semibold mb-4">{title}</h2>
    <div className="space-y-4">
      {children}
    </div>
  </section>
));

// Location item component
const LocationItem = memo(({ location, isActive, onEdit, onDelete, onSelect }) => (
  <div className={`p-4 rounded-lg border ${isActive ? 'border-blue-500 bg-gray-700' : 'border-gray-700'}`}>
    <div className="flex justify-between items-start">
      <div onClick={onSelect} className="cursor-pointer flex-1">
        <h3 className="text-lg font-medium">{location.name}</h3>
        <div className="flex mt-1 text-sm text-gray-400">
          <span className="mr-4">Capacity: {location.capacity}</span>
          {location.description && (
            <span className="truncate max-w-xs">{location.description}</span>
          )}
        </div>
      </div>
      <div className="flex space-x-2">
        <button 
          onClick={onEdit}
          className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
          title="Edit location"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
          </svg>
        </button>
        <button 
          onClick={onDelete}
          className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
          title="Delete location"
          disabled={isActive}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  </div>
));

// Location form modal
const LocationFormModal = memo(({ isOpen, location, onClose, onSave }) => {
  const [formData, setFormData] = useState(location || {
    id: '',
    name: '',
    capacity: 50,
    description: ''
  });

  useEffect(() => {
    if (location) {
      setFormData(location);
    } else {
      setFormData({
        id: uuidv4(),
        name: '',
        capacity: 50,
        description: ''
      });
    }
  }, [location, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">{location ? 'Edit Location' : 'Add Location'}</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-2">Location Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
              placeholder="e.g., Classroom A"
            />
          </div>
          
          <div>
            <label className="block text-sm mb-2">Maximum Capacity</label>
            <input
              type="number"
              value={formData.capacity}
              onChange={(e) => setFormData({...formData, capacity: parseInt(e.target.value) || 0})}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
              min="1"
            />
          </div>
          
          <div>
            <label className="block text-sm mb-2">Description (Optional)</label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
              rows={3}
              placeholder="e.g., Ground floor lecture hall"
            />
          </div>
        </div>
        
        <div className="flex justify-end gap-2 mt-6">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 rounded"
          >
            Cancel
          </button>
          <button 
            onClick={() => {
              if (!formData.name) return;
              onSave(formData);
              onClose();
            }}
            disabled={!formData.name}
            className={`px-4 py-2 rounded ${
              !formData.name ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
});

export default function Config() {
  const [config, setConfig] = useState<SystemConfig>({
    camera: 'default',
    sensitivity: 0.5,
    enableLogging: true,
    logFrequency: 300,
    lowPowerMode: true, // Default to true for Raspberry Pi
    optimizeForEdge: true, // Default to true for edge computing
  });
  
  const { 
    locations, 
    activeLocation, 
    setActiveLocation, 
    addLocation, 
    removeLocation 
  } = usePeopleCount();
  
  const [isTesting, setIsTesting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [locationFormOpen, setLocationFormOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<LocationData | null>(null);

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      // Save to localStorage for persistence
      localStorage.setItem('system-config', JSON.stringify(config));
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  // Load config from localStorage on mount
  useEffect(() => {
    const savedConfig = localStorage.getItem('system-config');
    if (savedConfig) {
      try {
        setConfig(JSON.parse(savedConfig));
      } catch (e) {
        console.error('Error parsing saved config:', e);
      }
    }
  }, []);

  const handleTestCamera = async () => {
    setIsTesting(true);
    try {
      // Use lower resolution constraints for Raspberry Pi
      const constraints = { 
        video: { 
          deviceId: config.camera,
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Stop the stream after testing
      stream.getTracks().forEach(track => track.stop());
      alert('Camera test successful!');
    } catch (error) {
      alert('Camera test failed. Please check your permissions and try again.');
      console.error('Camera test error:', error);
    } finally {
      setIsTesting(false);
    }
  };

  const openAddLocationForm = () => {
    setEditingLocation(null);
    setLocationFormOpen(true);
  };

  const openEditLocationForm = (location: LocationData) => {
    setEditingLocation(location);
    setLocationFormOpen(true);
  };

  const handleSaveLocation = (location: LocationData) => {
    if (editingLocation) {
      // Remove old location
      removeLocation(editingLocation.id);
    }
    // Add the location (new or edited)
    addLocation(location);
  };

  const handleDeleteLocation = (locationId: string) => {
    if (window.confirm('Are you sure you want to delete this location?')) {
      removeLocation(locationId);
    }
  };

  const handleSelectLocation = (locationId: string) => {
    setActiveLocation(locationId);
  };

  return (
    <div className="p-4 bg-gray-900 min-h-screen text-white">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
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

        <ConfigSection title="Camera Settings">
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
        </ConfigSection>

        <ConfigSection title="Detection Settings">
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
          
          <div className="mt-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.lowPowerMode}
                onChange={(e) => setConfig({ ...config, lowPowerMode: e.target.checked })}
                className="mr-2"
              />
              <span>Low Power Mode</span>
            </label>
            <p className="mt-1 text-sm text-gray-400 ml-6">
              Reduces processing frames and power consumption (recommended for Raspberry Pi).
            </p>
          </div>
          
          <div className="mt-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.optimizeForEdge}
                onChange={(e) => setConfig({ ...config, optimizeForEdge: e.target.checked })}
                className="mr-2"
              />
              <span>Optimize for Edge Computing</span>
            </label>
            <p className="mt-1 text-sm text-gray-400 ml-6">
              Uses model quantization and optimizations for low-resource devices.
            </p>
          </div>
        </ConfigSection>

        <ConfigSection title="Logging Settings">
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
        </ConfigSection>

        <ConfigSection title="Location Management">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-400">
              Configure locations to track separate spaces
            </p>
            <button
              onClick={openAddLocationForm}
              className="flex items-center px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm"
            >
              <Plus size={16} className="mr-1" />
              Add Location
            </button>
          </div>
          
          <div className="space-y-3">
            {locations.length === 0 ? (
              <div className="text-center py-6 text-gray-400 border border-dashed border-gray-700 rounded-lg">
                No locations configured. Add a location to get started.
              </div>
            ) : (
              locations.map(location => (
                <LocationItem
                  key={location.id}
                  location={location}
                  isActive={location.id === activeLocation}
                  onEdit={() => openEditLocationForm(location)}
                  onDelete={() => handleDeleteLocation(location.id)}
                  onSelect={() => handleSelectLocation(location.id)}
                />
              ))
            )}
          </div>
        </ConfigSection>
      </div>
      
      <LocationFormModal
        isOpen={locationFormOpen}
        location={editingLocation}
        onClose={() => setLocationFormOpen(false)}
        onSave={handleSaveLocation}
      />
    </div>
  );
}