"use client";

import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useRef } from "react";

const INACTIVITY_LIMIT_MS = 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 30 * 1000; // Check every 30 seconds
const STORAGE_KEY = "mangalens_last_activity";

export default function SessionGuard() {
  const { status } = useSession();
  const lastActivityRef = useRef<number>(0);

  const handleLogout = useCallback(() => {
    console.log("Auto-logging out due to inactivity...");
    signOut({ callbackUrl: "/auth/login", redirect: true });
  }, []);

  const checkInactivity = useCallback(() => {
    if (status !== "authenticated") return;

    const storedLastActivity = localStorage.getItem(STORAGE_KEY);
    const lastActivity = storedLastActivity
      ? parseInt(storedLastActivity, 10)
      : lastActivityRef.current;

    const now = Date.now();
    if (now - lastActivity >= INACTIVITY_LIMIT_MS) {
      handleLogout();
    }
  }, [status, handleLogout]);

  const updateActivity = useCallback(() => {
    const now = Date.now();
    // Throttle updates to localStorage to once every 10 seconds
    if (now - lastActivityRef.current > 10000) {
      lastActivityRef.current = now;
      localStorage.setItem(STORAGE_KEY, now.toString());
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;

    // Initial sync
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
    lastActivityRef.current = Date.now();

    const events = [
      "mousedown",
      "mousemove",
      "keydown",
      "scroll",
      "touchstart",
    ];

    const handleUserActivity = () => {
      updateActivity();
    };

    events.forEach((event) => {
      window.addEventListener(event, handleUserActivity);
    });

    const interval = setInterval(checkInactivity, CHECK_INTERVAL_MS);

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleUserActivity);
      });
      clearInterval(interval);
    };
  }, [status, checkInactivity, updateActivity]);

  return null;
}
