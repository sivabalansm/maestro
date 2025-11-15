import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { format, parseISO, differenceInMinutes } from 'date-fns';

export function GanttChart({ tasks }) {
  const chartData = useMemo(() => {
    return tasks
      .filter(task => task.scheduled_at || task.created_at)
      .map((task, index) => {
        const startDate = task.scheduled_at ? parseISO(task.scheduled_at) : parseISO(task.created_at);
        const endDate = task.completed_at ? parseISO(task.completed_at) : new Date();
        const duration = Math.max(differenceInMinutes(endDate, startDate), 1);

        return {
          name: task.type.substring(0, 15),
          start: format(startDate, 'HH:mm'),
          duration,
          status: task.status,
          taskId: task.id
        };
      })
      .slice(0, 10); // Limit to 10 tasks for display
  }, [tasks]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#22c55e';
      case 'failed': return '#ef4444';
      case 'started': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  if (chartData.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground">
        No scheduled tasks to display
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} layout="vertical">
        <XAxis type="number" />
        <YAxis dataKey="name" type="category" width={100} />
        <Tooltip
          formatter={(value, name, props) => {
            if (name === 'duration') {
              return [`${value} minutes`, 'Duration'];
            }
            return [value, name];
          }}
        />
        <Bar dataKey="duration" radius={[0, 4, 4, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={getStatusColor(entry.status)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

