import { useState, useEffect, useCallback, useRef } from 'react';
import { useCurrentUserState } from '@/lib/auth/use-current-user';
import { VisitorStats } from '../types.ts';

const SESSION_KEY = 'agent_brew_visitor_session_id';

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "bw_ssr";
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id || id.length < 8) {
      id = 'bw_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now().toString(36);
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return 'bw_fallback_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
  }
}

export function useRealtimeVisitors() {
  const { user } = useCurrentUserState();
  const [stats, setStats] = useState<VisitorStats>({
    activeVisitors: 1,
    totalVisits: 142,
    uniqueVisitors: 45
  });
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const sessionIdRef = useRef<string>(getOrCreateSessionId());

  // Ping backend to register presence & get accurate live counts
  const sendPing = useCallback(async () => {
    try {
      const res = await fetch('/api/visitors/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          path: window.location.pathname,
          referrer: document.referrer || '',
          userId: user?.id || undefined,
          username: user?.username || user?.displayName || undefined,
          primaryEmail: user?.primaryEmail || undefined,
          profileImageUrl: user?.profileImageUrl || undefined,
        })
      });
      if (res.ok) {
        const data = await res.json();
        setStats(prev => ({
          ...prev,
          activeVisitors: Math.max(Number(data.activeVisitors) || 1, 1),
          totalVisits: Number(data.totalVisits) || prev.totalVisits,
          uniqueVisitors: Number(data.uniqueVisitors) || prev.uniqueVisitors
        }));
        setIsConnected(true);
      }
    } catch {
      // Keep existing count on transient network issue
    }
  }, [user?.id, user?.displayName, user?.primaryEmail, user?.profileImageUrl]);

  useEffect(() => {
    sendPing();

    const pingTimer = setInterval(() => {
      if (!document.hidden) {
        sendPing();
      }
    }, 10000);

    // Refresh immediately when user switches back to the tab
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        sendPing();
      }
    };

    // Leave beacon on tab close / reload
    const handleLeave = () => {
      try {
        const payload = JSON.stringify({ sessionId: sessionIdRef.current });
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/visitors/leave', payload);
        } else {
          fetch('/api/visitors/leave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true
          }).catch(() => {});
        }
      } catch {
        /* ignore */
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
    window.addEventListener('beforeunload', handleLeave);
    window.addEventListener('pagehide', handleLeave);

    return () => {
      clearInterval(pingTimer);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleLeave);
      window.removeEventListener('pagehide', handleLeave);
    };
  }, [sendPing]);

  return {
    stats,
    isConnected,
    sessionId: sessionIdRef.current,
    refreshStats: sendPing
  };
}
