import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function useConnectionStatus() {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const checkConnection = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/extension/status`);
      setIsConnected(response.data.connected);
      setIsLoading(false);
    } catch (error) {
      console.error('Error checking connection status:', error);
      setIsConnected(false);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Check immediately
    checkConnection();

    // Poll every 3 seconds
    const interval = setInterval(checkConnection, 3000);

    return () => clearInterval(interval);
  }, []);

  return { isConnected, isLoading, refresh: checkConnection };
}

