import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Edit2, X, Clock } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function Scheduled() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editDateTime, setEditDateTime] = useState('');

  useEffect(() => {
    fetchScheduledTasks();
    const interval = setInterval(fetchScheduledTasks, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchScheduledTasks = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/tasks/scheduled?userId=anonymous`);
      setTasks(response.data.tasks || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching scheduled tasks:', error);
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const getTimeUntil = (dateString) => {
    if (!dateString) return 'N/A';
    const now = new Date();
    const scheduled = new Date(dateString);
    const diff = scheduled - now;

    if (diff < 0) return 'Overdue';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const handleEdit = (task) => {
    setEditingTaskId(task.id);
    // Convert scheduled_at to datetime-local format
    const date = new Date(task.scheduled_at);
    const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setEditDateTime(localDateTime);
  };

  const handleSaveEdit = async (taskId) => {
    try {
      const response = await axios.put(`${API_URL}/api/tasks/${taskId}/schedule`, {
        scheduledAt: new Date(editDateTime).toISOString()
      });
      
      setEditingTaskId(null);
      setEditDateTime('');
      fetchScheduledTasks();
    } catch (error) {
      console.error('Error updating scheduled time:', error);
      alert(error.response?.data?.error || 'Failed to update scheduled time');
    }
  };

  const handleCancel = async (taskId) => {
    if (!confirm('Are you sure you want to cancel this scheduled task?')) {
      return;
    }

    try {
      await axios.delete(`${API_URL}/api/tasks/${taskId}`);
      fetchScheduledTasks();
    } catch (error) {
      console.error('Error cancelling task:', error);
      alert(error.response?.data?.error || 'Failed to cancel task');
    }
  };

  const handleCancelEdit = () => {
    setEditingTaskId(null);
    setEditDateTime('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Scheduled Tasks</h1>
        <p className="text-muted-foreground">Manage your scheduled automation tasks</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scheduled Tasks</CardTitle>
          <CardDescription>Tasks that will execute automatically at their scheduled time</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground">Loading scheduled tasks...</div>
          ) : tasks.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No scheduled tasks yet.</p>
              <p className="text-sm mt-2">Schedule a task from the Home page using natural language like "tomorrow at 3pm"</p>
            </div>
          ) : (
            <div className="space-y-4">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium text-lg">{task.type}</span>
                        {task.reasoning && (
                          <span className="text-sm text-muted-foreground">
                            - {task.reasoning}
                          </span>
                        )}
                      </div>
                      
                      {editingTaskId === task.id ? (
                        <div className="space-y-2">
                          <Input
                            type="datetime-local"
                            value={editDateTime}
                            onChange={(e) => setEditDateTime(e.target.value)}
                            className="max-w-xs"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleSaveEdit(task.id)}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancelEdit}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            <span>Scheduled: {formatDate(task.scheduled_at)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-primary">
                              Time until execution: {getTimeUntil(task.scheduled_at)}
                            </span>
                          </div>
                          {task.params && (
                            <div className="mt-2 text-xs">
                              <span className="font-medium">Params: </span>
                              {JSON.stringify(task.params).substring(0, 100)}
                              {JSON.stringify(task.params).length > 100 ? '...' : ''}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {editingTaskId !== task.id && (
                      <div className="flex gap-2 ml-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(task)}
                        >
                          <Edit2 className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCancel(task.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <X className="w-4 h-4 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

