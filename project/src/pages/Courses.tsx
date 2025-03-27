import React, { useState } from 'react';
import { Plus, Trash2, Edit, Clock } from 'lucide-react';
import { useCourses } from '../context/CourseContext';
import { Course } from '../types';

const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
];

export default function Courses() {
  const { courses, addCourse, updateCourse, deleteCourse } = useCourses();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [newCourseName, setNewCourseName] = useState('');
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [scheduleEntries, setScheduleEntries] = useState<Array<{day: string; startTime: string; endTime: string}>>([
    { day: 'Monday', startTime: '09:00', endTime: '10:30' }
  ]);
  const [searchQuery, setSearchQuery] = useState('');

  const handleAddCourse = () => {
    if (!newCourseName.trim()) return;
    
    addCourse({
      name: newCourseName,
      schedule: scheduleEntries
    });
    
    setNewCourseName('');
    setScheduleEntries([{ day: 'Monday', startTime: '09:00', endTime: '10:30' }]);
    setIsAddModalOpen(false);
  };

  const handleUpdateCourse = () => {
    if (!editingCourse || !editingCourse.name.trim()) return;
    
    updateCourse(editingCourse.id, {
      name: editingCourse.name,
      schedule: editingCourse.schedule
    });
    
    setEditingCourse(null);
    setIsEditModalOpen(false);
  };

  const handleEditClick = (course: Course) => {
    setEditingCourse(course);
    setIsEditModalOpen(true);
  };

  const addScheduleEntry = () => {
    setScheduleEntries([
      ...scheduleEntries,
      { day: 'Monday', startTime: '09:00', endTime: '10:30' }
    ]);
  };

  const updateScheduleEntry = (index: number, field: string, value: string) => {
    const updatedEntries = [...scheduleEntries];
    updatedEntries[index] = { ...updatedEntries[index], [field]: value };
    setScheduleEntries(updatedEntries);
  };

  const removeScheduleEntry = (index: number) => {
    setScheduleEntries(scheduleEntries.filter((_, i) => i !== index));
  };

  const addEditScheduleEntry = () => {
    if (!editingCourse) return;
    
    setEditingCourse({
      ...editingCourse,
      schedule: [
        ...editingCourse.schedule,
        { day: 'Monday', startTime: '09:00', endTime: '10:30' }
      ]
    });
  };

  const updateEditScheduleEntry = (index: number, field: string, value: string) => {
    if (!editingCourse) return;
    
    const updatedSchedule = [...editingCourse.schedule];
    updatedSchedule[index] = { ...updatedSchedule[index], [field]: value };
    
    setEditingCourse({
      ...editingCourse,
      schedule: updatedSchedule
    });
  };

  const removeEditScheduleEntry = (index: number) => {
    if (!editingCourse) return;
    
    setEditingCourse({
      ...editingCourse,
      schedule: editingCourse.schedule.filter((_, i) => i !== index)
    });
  };

  const filteredCourses = courses.filter(course => 
    course.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 bg-gray-900 min-h-screen text-white">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Course Management</h1>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Plus size={20} className="mr-2" />
            Add Course
          </button>
        </div>

        <div className="mb-6">
          <input
            type="text"
            placeholder="Search courses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
          />
        </div>

        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-700">
                <th className="px-6 py-3 text-left">Course Name</th>
                <th className="px-6 py-3 text-left">Schedule</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCourses.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-center text-gray-400">
                    No courses found. Add a course to get started.
                  </td>
                </tr>
              ) : (
                filteredCourses.map((course) => (
                  <tr key={course.id} className="border-t border-gray-700">
                    <td className="px-6 py-4">{course.name}</td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {course.schedule.map((schedule, index) => (
                          <div key={index} className="flex items-center text-sm">
                            <Clock size={14} className="mr-2 text-gray-400" />
                            {schedule.day} {schedule.startTime} - {schedule.endTime}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleEditClick(course)}
                          className="p-1 text-blue-400 hover:text-blue-300"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => deleteCourse(course.id)}
                          className="p-1 text-red-400 hover:text-red-300"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Course Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Add New Course</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Course Name</label>
                <input
                  type="text"
                  value={newCourseName}
                  onChange={(e) => setNewCourseName(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                  placeholder="Enter course name"
                />
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium">Schedule</label>
                  <button
                    onClick={addScheduleEntry}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    + Add Time Slot
                  </button>
                </div>
                
                {scheduleEntries.map((entry, index) => (
                  <div key={index} className="bg-gray-700 p-3 rounded-lg mb-2">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">Time Slot {index + 1}</span>
                      {scheduleEntries.length > 1 && (
                        <button
                          onClick={() => removeScheduleEntry(index)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs mb-1">Day</label>
                        <select
                          value={entry.day}
                          onChange={(e) => updateScheduleEntry(index, 'day', e.target.value)}
                          className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-sm"
                        >
                          {DAYS_OF_WEEK.map(day => (
                            <option key={day} value={day}>{day}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs mb-1">Start</label>
                        <input
                          type="time"
                          value={entry.startTime}
                          onChange={(e) => updateScheduleEntry(index, 'startTime', e.target.value)}
                          className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs mb-1">End</label>
                        <input
                          type="time"
                          value={entry.endTime}
                          onChange={(e) => updateScheduleEntry(index, 'endTime', e.target.value)}
                          className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex justify-end mt-6 space-x-2">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCourse}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
                disabled={!newCourseName.trim()}
              >
                Add Course
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Edit Course Modal */}
      {isEditModalOpen && editingCourse && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Edit Course</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Course Name</label>
                <input
                  type="text"
                  value={editingCourse.name}
                  onChange={(e) => setEditingCourse({ ...editingCourse, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                />
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium">Schedule</label>
                  <button
                    onClick={addEditScheduleEntry}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    + Add Time Slot
                  </button>
                </div>
                
                {editingCourse.schedule.map((entry, index) => (
                  <div key={index} className="bg-gray-700 p-3 rounded-lg mb-2">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">Time Slot {index + 1}</span>
                      {editingCourse.schedule.length > 1 && (
                        <button
                          onClick={() => removeEditScheduleEntry(index)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs mb-1">Day</label>
                        <select
                          value={entry.day}
                          onChange={(e) => updateEditScheduleEntry(index, 'day', e.target.value)}
                          className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-sm"
                        >
                          {DAYS_OF_WEEK.map(day => (
                            <option key={day} value={day}>{day}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs mb-1">Start</label>
                        <input
                          type="time"
                          value={entry.startTime}
                          onChange={(e) => updateEditScheduleEntry(index, 'startTime', e.target.value)}
                          className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs mb-1">End</label>
                        <input
                          type="time"
                          value={entry.endTime}
                          onChange={(e) => updateEditScheduleEntry(index, 'endTime', e.target.value)}
                          className="w-full px-2 py-1 bg-gray-600 border border-gray-500 rounded text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex justify-end mt-6 space-x-2">
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingCourse(null);
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateCourse}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
