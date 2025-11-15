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
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
        isComplete
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setScheduledTime('');

      // If task is not complete, start polling for updates
      if (!isComplete && sessionId) {
        // Poll for task updates (in a real implementation, use WebSocket)
        pollTaskUpdates(sessionId);
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
    // Simple polling - in production, use WebSocket for real-time updates
    const pollInterval = setInterval(async () => {
      try {
        // Check if session is still active
        // This is a simplified version - in production, you'd get updates via WebSocket
        // or check task status from the dashboard
      } catch (error) {
        console.error('Error polling task updates:', error);
        clearInterval(pollInterval);
      }
    }, 5000);

    // Stop polling after 5 minutes
    setTimeout(() => clearInterval(pollInterval), 300000);
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

