// Installable app and offline use (browser version). The service worker lives in public/sw.js.
import { useEffect, useState } from 'react';

let deferredPrompt = null;
const listeners = new Set();
const emit = () => listeners.forEach((f) => f());

export function registerOffline() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emit();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}

// { online, canInstall, install }
export function useAppStatus() {
  const [, refresh] = useState(0);
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const update = () => refresh((n) => n + 1);
    const on = () => setOnline(true),
      off = () => setOnline(false);
    listeners.add(update);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      listeners.delete(update);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return {
    online,
    canInstall: !!deferredPrompt,
    async install() {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => {});
      deferredPrompt = null;
      emit();
    },
  };
}
