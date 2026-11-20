import {useCallback, useEffect, useState} from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{outcome: 'accepted' | 'dismissed'; platform: string}>;
}

declare global {
  interface Window {
    __abwabDeferredInstallPrompt?: Event | null;
  }
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => {
    if (typeof window !== 'undefined' && window.__abwabDeferredInstallPrompt) {
      return window.__abwabDeferredInstallPrompt as BeforeInstallPromptEvent;
    }
    return null;
  });
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    const checkStandalone = () => {
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as {standalone?: boolean}).standalone === true;
      setIsInstalled(isStandalone);
    };

    checkStandalone();

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIPadOS =
      navigator.platform === 'MacIntel' && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;
    setIsIOS(/iphone|ipad|ipod/.test(userAgent) || isIPadOS);
    setIsAndroid(/android/.test(userAgent));

    if (window.__abwabDeferredInstallPrompt) {
      setDeferredPrompt(window.__abwabDeferredInstallPrompt as BeforeInstallPromptEvent);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      window.__abwabDeferredInstallPrompt = e;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleEarlyPromptReady = () => {
      if (window.__abwabDeferredInstallPrompt) {
        setDeferredPrompt(window.__abwabDeferredInstallPrompt as BeforeInstallPromptEvent);
      }
    };

    const handleAppInstalled = () => {
      window.__abwabDeferredInstallPrompt = null;
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const displayModeMq = window.matchMedia('(display-mode: standalone)');
    displayModeMq.addEventListener?.('change', checkStandalone);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('abwab:installpromptready', handleEarlyPromptReady);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      displayModeMq.removeEventListener?.('change', checkStandalone);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('abwab:installpromptready', handleEarlyPromptReady);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    const activePrompt =
      deferredPrompt ||
      (window.__abwabDeferredInstallPrompt as BeforeInstallPromptEvent | null | undefined);
    if (!activePrompt) return false;
    await activePrompt.prompt();
    const {outcome} = await activePrompt.userChoice;
    if (outcome === 'accepted') {
      window.__abwabDeferredInstallPrompt = null;
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  }, [deferredPrompt]);

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    isAndroid,
    install,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return isOnline;
}
