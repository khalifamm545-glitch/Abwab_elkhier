import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

declare global {
  interface Window {
    __abwabDeferredInstallPrompt?: Event | null;
  }
}

// Capture beforeinstallprompt early so fast-loading devices never miss Android/Chrome install readiness
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  window.__abwabDeferredInstallPrompt = event;
  window.dispatchEvent(new CustomEvent('abwab:installpromptready'));
});

window.addEventListener('appinstalled', () => {
  window.__abwabDeferredInstallPrompt = null;
});

// Auto-update Service Worker so cached UI files always refresh cleanly when a new version is published
if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        // Periodically check for updated UI assets in the background (hourly)
        window.setInterval(() => {
          void registration.update();
        }, 60 * 60 * 1000);
      }
    },
  });
}

createRoot(document.getElementById('root')!).render(<App />);
