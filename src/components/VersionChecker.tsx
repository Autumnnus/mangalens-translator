"use client";

import { useEffect } from "react";

const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export default function VersionChecker() {
  useEffect(() => {
    const checkVersion = async () => {
      try {
        const res = await fetch("/api/version");
        if (!res.ok) return;

        const data = await res.json();
        const remoteVersion = data.version;
        const localVersion = localStorage.getItem("app_version");

        if (!localVersion) {
          localStorage.setItem("app_version", remoteVersion);
        } else if (localVersion !== remoteVersion) {
          console.log(
            `Version mismatch! Local: ${localVersion}, Remote: ${remoteVersion}. Reloading...`,
          );

          localStorage.clear();
          sessionStorage.clear();

          localStorage.setItem("app_version", remoteVersion);

          window.location.reload();
        }
      } catch (error) {
        console.error("Failed to check version:", error);
      }
    };

    checkVersion();

    const interval = setInterval(checkVersion, VERSION_CHECK_INTERVAL_MS);

    const handleFocus = () => checkVersion();
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  return null;
}
