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
    setInput('');
    setIsLoading(true);

    try {
      // Convert prompt to task
      // In production, this would use an AI model to convert natural language to tasks
      const task = convertPromptToTask(input);

      // Create task
      const response = await axios.post(`${API_URL}/api/tasks/create`, {
        type: task.type,
        params: task.params,
        scheduledAt: scheduledTime || null,
        extensionId: 'ext_demo', // In production, get from extension registration
        userId: 'anonymous'
      });

      const assistantMessage = {
        role: 'assistant',
        content: `Task created: ${task.type}. ${scheduledTime ? `Scheduled for ${new Date(scheduledTime).toLocaleString()}` : 'Executing now...'}`,
        task: response.data.task
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setScheduledTime('');
    } catch (error) {
      console.error('Error creating task:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${error.message}` }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const convertPromptToTask = (prompt) => {
    const lower = prompt.toLowerCase();

    // Simple rule-based conversion (in production, use AI)
    if (lower.includes('open') || lower.includes('navigate') || lower.includes('go to')) {
      const urlMatch = prompt.match(/(https?:\/\/[^\s]+|www\.[^\s]+|[a-z]+\.[a-z]+)/i);
      const url = urlMatch ? (urlMatch[0].startsWith('http') ? urlMatch[0] : `https://${urlMatch[0]}`) : 'https://google.com';
      return { type: 'navigate', params: { url } };
    }

    if (lower.includes('click')) {
      const selectorMatch = prompt.match(/click\s+(?:on\s+)?(?:the\s+)?([^\s]+)/i);
      return { type: 'click', params: { selector: selectorMatch ? `#${selectorMatch[1]}` : 'button' } };
    }

    if (lower.includes('fill') || lower.includes('type') || lower.includes('search')) {
      const valueMatch = prompt.match(/(?:fill|type|search)\s+(?:for\s+)?["']?([^"']+)["']?/i);
      const value = valueMatch ? valueMatch[1] : prompt.split(' ').slice(1).join(' ');
      return { type: 'fill', params: { selector: 'input[type="search"], input[type="text"]', value } };
    }

    // Default: navigate to Google
    return { type: 'navigate', params: { url: 'https://google.com' } };
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Card className="h-[calc(100vh-8rem)] flex flex-col">
        <CardHeader>
          <CardTitle>Maestro Agent</CardTitle>
          <CardDescription>
            Describe what you want to automate, and I'll create a task for the browser extension.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-4 mb-4">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                <p>Start by describing a task you want to automate.</p>
                <p className="text-sm mt-2">Example: "Open google.com and search for AI"</p>
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

