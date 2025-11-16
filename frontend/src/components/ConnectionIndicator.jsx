import { Wifi, WifiOff } from 'lucide-react';
import { useConnectionStatus } from '../hooks/useConnectionStatus';
import { cn } from '../lib/utils';

export default function ConnectionIndicator() {
  const { isConnected, isLoading } = useConnectionStatus();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted text-muted-foreground text-sm">
        <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" />
        <span>Checking...</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
        isConnected
          ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20'
          : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
      )}
    >
      {isConnected ? (
        <>
          <Wifi className="w-4 h-4" />
          <span>Extension Connected</span>
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4" />
          <span>Extension Disconnected</span>
        </>
      )}
    </div>
  );
}

