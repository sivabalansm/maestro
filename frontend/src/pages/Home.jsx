import { useState, useRef, useEffect } from 'react';
import { Send, Clock } from 'lucide-react';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');
  const [activeSessions, setActiveSessions] = useState(new Map()); // Track active sessions
  const messagesEndRef = useRef(null);
  const pollIntervalsRef = useRef(new Map()); // Store poll intervals for cleanup

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Cleanup polling intervals on unmount
  useEffect(() => {
    return () => {
      pollIntervalsRef.current.forEach(cleanup => cleanup());
      pollIntervalsRef.current.clear();
    };
  }, []);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    const prompt = input;
    setInput('');
    setIsLoading(true);

    try {
      // Get primary connected extension
      let extensionId;
      try {
        const primaryRes = await axios.get(`${API_URL}/api/extension/primary`);
        extensionId = primaryRes.data.extensionId;
      } catch (error) {
        if (error.response?.status === 404) {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: 'Error: No browser extension connected. Please make sure the Maestro extension is loaded and connected to the backend.' }
          ]);
          setIsLoading(false);
          return;
        }
        throw error;
      }

      // Start AI-powered task sequence
      const response = await axios.post(`${API_URL}/api/ai/start`, {
        prompt,
        extensionId,
        userId: 'anonymous',
        scheduledAt: scheduledTime || null
      });

      const { task, reasoning, sessionId, isComplete } = response.data;

      const assistantMessage = {
        role: 'assistant',
        content: `AI Analysis: ${reasoning}\n\nTask: ${task.type}${isComplete ? ' (Complete)' : ' (Continuing...)'}`,
        task,
        reasoning,
        sessionId,
        isComplete,
        timestamp: Date.now()
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setScheduledTime('');

      // If task is not complete, start polling for updates
      if (!isComplete && sessionId) {
        // Track this session and start polling
        setActiveSessions(prev => new Map(prev).set(sessionId, { lastTaskIndex: 0 }));
        const cleanup = pollTaskUpdates(sessionId);
        // Store cleanup function
        pollIntervalsRef.current.set(sessionId, cleanup);
      }
    } catch (error) {
      console.error('Error starting AI task:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${error.response?.data?.error || error.message}` }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const pollTaskUpdates = async (sessionId) => {
    let pollCount = 0;
    const maxPolls = 200; // Poll for up to 10 minutes (200 * 3 seconds)
    
    const pollInterval = setInterval(async () => {
      try {
        pollCount++;
        
        // Get session status
        const response = await axios.get(`${API_URL}/api/ai/session/${sessionId}`);
        const { conversationHistory, isComplete, status } = response.data;
        
        // Get the last task index we've seen
        const sessionInfo = activeSessions.get(sessionId);
        const lastTaskIndex = sessionInfo?.lastTaskIndex || 0;
        
        // Find new tasks in conversation history
        const taskEntries = conversationHistory
          .map((entry, idx) => ({ ...entry, index: idx }))
          .filter(entry => entry.task && entry.index > lastTaskIndex);
        
        // Add new task messages to chat
        if (taskEntries.length > 0) {
          taskEntries.forEach(entry => {
            const taskMessage = {
              role: 'assistant',
              content: `${entry.reasoning ? `AI: ${entry.reasoning}\n\n` : ''}Task: ${entry.task.type}${entry.task.params?.selector ? ` (${entry.task.params.selector})` : ''}${entry.result ? `\nResult: ${typeof entry.result === 'string' ? entry.result.substring(0, 100) : JSON.stringify(entry.result).substring(0, 100)}` : ''}${entry.error ? `\nError: ${entry.error}` : ''}`,
              task: entry.task,
              reasoning: entry.reasoning,
              sessionId,
              timestamp: Date.now()
            };
            
            setMessages(prev => [...prev, taskMessage]);
          });
          
          // Update last task index
          const newLastIndex = Math.max(...taskEntries.map(e => e.index));
          setActiveSessions(prev => {
            const newMap = new Map(prev);
            newMap.set(sessionId, { lastTaskIndex: newLastIndex });
            return newMap;
          });
        }
        
        // Stop polling if session is complete
        if (isComplete || status === 'completed') {
          // Add completion message
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: '✅ Task sequence completed!',
            sessionId,
            timestamp: Date.now()
          }]);
          
          setActiveSessions(prev => {
            const newMap = new Map(prev);
            newMap.delete(sessionId);
            return newMap;
          });
          clearInterval(pollInterval);
          pollIntervalsRef.current.delete(sessionId);
        }
        
        // Stop polling after max attempts
        if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
          setActiveSessions(prev => {
            const newMap = new Map(prev);
            newMap.delete(sessionId);
            return newMap;
          });
          pollIntervalsRef.current.delete(sessionId);
        }
      } catch (error) {
        console.error('Error polling task updates:', error);
        // Don't stop polling on error - might be temporary
        if (error.response?.status === 404) {
          // Session not found, stop polling
          clearInterval(pollInterval);
          setActiveSessions(prev => {
            const newMap = new Map(prev);
            newMap.delete(sessionId);
            return newMap;
          });
          pollIntervalsRef.current.delete(sessionId);
        }
      }
    }, 3000); // Poll every 3 seconds

    // Return cleanup function
    return () => {
      clearInterval(pollInterval);
      pollIntervalsRef.current.delete(sessionId);
    };
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Card className="h-[calc(100vh-8rem)] flex flex-col">
        <CardHeader>
          <CardTitle>Maestro Agent</CardTitle>
          <CardDescription>
            Describe what you want to automate. AI will analyze the current page and generate tasks automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-4 mb-4">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                <p>Start by describing a task you want to automate.</p>
                <p className="text-sm mt-2">Example: "Click the search button" or "Fill the form with my email"</p>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-2">Thinking...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                type="datetime-local"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                placeholder="Schedule for later (optional)"
                className="flex-1"
              />
              <Clock className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Describe a task to automate..."
                className="flex-1"
              />
              <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
                <Send className="w-4 h-4 mr-2" />
                Send
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

