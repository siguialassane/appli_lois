import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (import.meta.env.DEV) {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        return Promise.all(registrations.map((registration) => registration.unregister()));
      });

      if ("caches" in window) {
        void window.caches.keys().then((keys) => {
          return Promise.all(keys.map((key) => window.caches.delete(key)));
        });
      }

      return;
    }

    void navigator.serviceWorker.register("/sw.js");
  }, []);

  return null;
}
