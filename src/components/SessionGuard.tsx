"use client";

import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useRef } from "react";

const INACTIVITY_LIMIT_MS = 60 * 60 * 1000;
const SESSION_LIMIT_MS = 60 * 60 * 1000; // 1 hour absolute limit
const CHECK_INTERVAL_MS = 30 * 1000; // Check every 30 seconds
const ACTIVITY_KEY = "mangalens_last_activity";
const LOGIN_TIMESTAMP_KEY = "mangalens_login_timestamp";

export default function SessionGuard() {
  const { status } = useSession();
  const lastActivityRef = useRef<number>(0);

  const handleLogout = useCallback(() => {
    console.log("Session expired. Logging out...");

    // Clear all mangalens related data from localStorage
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("mangalens_")) {
        localStorage.removeItem(key);
      }
    });

    signOut({ callbackUrl: "/auth/login", redirect: true });
  }, []);

  const checkSession = useCallback(() => {
    if (status !== "authenticated") return;

    const now = Date.now();

    // 1. Check absolute session time (calculated from login)
    const loginTimestamp = localStorage.getItem(LOGIN_TIMESTAMP_KEY);
    if (loginTimestamp) {
      const loginTime = parseInt(loginTimestamp, 10);
      if (now - loginTime >= SESSION_LIMIT_MS) {
        console.log("Absolute session timeout reached");
        handleLogout();
        return;
      }
    }

    // 2. Check inactivity
    const storedLastActivity = localStorage.getItem(ACTIVITY_KEY);
    const lastActivity = storedLastActivity
      ? parseInt(storedLastActivity, 10)
      : lastActivityRef.current;

    if (now - lastActivity >= INACTIVITY_LIMIT_MS) {
      console.log("Inactivity timeout reached");
      handleLogout();
    }
  }, [status, handleLogout]);

  const updateActivity = useCallback(() => {
    const now = Date.now();
    // Throttle updates to localStorage to once every 10 seconds
    if (now - lastActivityRef.current > 10000) {
      lastActivityRef.current = now;
      localStorage.setItem(ACTIVITY_KEY, now.toString());
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;

    // Initial sync
    if (!localStorage.getItem(LOGIN_TIMESTAMP_KEY)) {
      localStorage.setItem(LOGIN_TIMESTAMP_KEY, Date.now().toString());
    }
    localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
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

    const interval = setInterval(checkSession, CHECK_INTERVAL_MS);

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleUserActivity);
      });
      clearInterval(interval);
    };
  }, [status, checkSession, updateActivity]);

  return null;
}
