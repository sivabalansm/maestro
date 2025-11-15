import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { GanttChart } from '../components/GanttChart';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [latestTask, setLatestTask] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [tasksRes, latestRes] = await Promise.all([
        axios.get(`${API_URL}/api/tasks/queue?userId=anonymous`),
        axios.get(`${API_URL}/api/tasks/latest?userId=anonymous`)
      ]);

      setTasks(tasksRes.data.tasks || []);
      setLatestTask(latestRes.data.task);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'text-green-600';
      case 'failed': return 'text-red-600';
      case 'started': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Monitor your automated tasks</p>
      </div>

      {/* Upper Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gantt Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Task Timeline</CardTitle>
            <CardDescription>Visual overview of scheduled tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <GanttChart tasks={tasks} />
          </CardContent>
        </Card>

        {/* Latest Task */}
        <Card>
          <CardHeader>
            <CardTitle>Last Task Completed</CardTitle>
            <CardDescription>Most recent task execution</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-muted-foreground">Loading...</div>
            ) : latestTask ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{latestTask.type}</span>
                  <span className={`text-sm ${getStatusColor(latestTask.status)}`}>
                    {latestTask.status}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>Completed: {formatDate(latestTask.completed_at)}</p>
                  {latestTask.result && (
                    <p className="mt-2">Result: {JSON.stringify(latestTask.result).substring(0, 100)}...</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground">No tasks completed yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Task List */}
      <Card>
        <CardHeader>
          <CardTitle>Task History</CardTitle>
          <CardDescription>All completed and pending tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {loading ? (
              <div className="text-muted-foreground">Loading tasks...</div>
            ) : tasks.length === 0 ? (
              <div className="text-muted-foreground">No tasks yet. Create one from the Home page.</div>
            ) : (
              tasks.map((task) => (
                <div
                  key={task.id}
                  className="border-b border-border pb-4 last:border-0"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{task.type}</span>
                        <span className={`text-xs px-2 py-1 rounded ${getStatusColor(task.status)} bg-opacity-10`}>
                          {task.status}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        <p>Created: {formatDate(task.created_at)}</p>
                        {task.completed_at && (
                          <p>Completed: {formatDate(task.completed_at)}</p>
                        )}
                        {task.error && (
                          <p className="text-red-600">Error: {task.error}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

