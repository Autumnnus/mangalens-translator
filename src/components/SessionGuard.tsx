"use client";

import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useRef } from "react";

const INACTIVITY_LIMIT_MS = 60 * 60 * 1000;

export default function SessionGuard() {
  const { data: session } = useSession();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    if (session) {
      timerRef.current = setTimeout(() => {
        console.log("Auto-logging out due to inactivity...");
        signOut();
      }, INACTIVITY_LIMIT_MS);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;

    const events = [
      "mousedown",
      "mousemove",
      "keydown",
      "scroll",
      "touchstart",
    ];

    resetTimer();

    const handleActivity = () => {
      resetTimer();
    };

    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [session, resetTimer]);

  return null;
}
