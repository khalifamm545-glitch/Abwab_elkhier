import {useCallback, useEffect, useState} from 'react';
import {AuthScreen} from './components/AuthScreen';
import {DashboardShell} from './components/DashboardShell';
import {ForcePasswordChangeScreen} from './components/ForcePasswordChangeScreen';
import {HomePage} from './components/HomePage';
import {InstallAppPage} from './components/InstallAppPage';
import {SplashScreen} from './components/SplashScreen';
import {AuthProvider, useAuth} from './context/AuthContext';

type AppView = 'home' | 'login' | 'dashboard' | 'install';

function resolveViewFromPath(pathname: string): AppView {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/install') return 'install';
  if (clean === '/login') return 'login';
  if (clean === '/dashboard') return 'dashboard';
  return 'home';
}

function pathForView(view: AppView): string {
  if (view === 'install') return '/install';
  if (view === 'login') return '/login';
  if (view === 'dashboard') return '/dashboard';
  return '/';
}

function AppRouter() {
  const {session, isLoading} = useAuth();
  const [view, setViewState] = useState<AppView>(() =>
    typeof window !== 'undefined' ? resolveViewFromPath(window.location.pathname) : 'home',
  );

  const navigate = useCallback((next: AppView) => {
    setViewState(next);
    if (typeof window !== 'undefined') {
      const targetPath = pathForView(next);
      if (window.location.pathname !== targetPath) {
        window.history.pushState({view: next}, '', targetPath);
      }
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setViewState(resolveViewFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Strict client-side guard matching server-side protection: never show dashboard without session,
  // and cleanly redirect already-authenticated users visiting /login straight into /dashboard
  useEffect(() => {
    if (isLoading) return;
    if (!session && view === 'dashboard') {
      navigate('login');
    } else if (session && view === 'login') {
      navigate('dashboard');
    }
  }, [isLoading, session, view, navigate]);

  // Branded Splash Screen while initial auth/session state resolves
  if (isLoading) {
    return <SplashScreen />;
  }

  // Dedicated public install page (/install) — accessible without login for sharing
  if (view === 'install') {
    return (
      <InstallAppPage
        isAuthenticated={Boolean(session)}
        onBackHome={() => navigate('home')}
        onOpenApp={() => navigate(session ? 'dashboard' : 'home')}
        onOpenLogin={() => navigate('login')}
      />
    );
  }

  // Mandatory first-login temporary password change gate (mirrors server-side 403 PASSWORD_CHANGE_REQUIRED)
  if (session && session.user.mustChangePassword) {
    return (
      <ForcePasswordChangeScreen
        session={session}
        onCompleted={() => navigate('dashboard')}
        onLoggedOut={() => navigate('home')}
      />
    );
  }

  if (view === 'login' && !session) {
    return (
      <AuthScreen
        onBackHome={() => navigate('home')}
        onSuccess={() => navigate('dashboard')}
      />
    );
  }

  if (view === 'dashboard' && session) {
    return <DashboardShell session={session} onGoHome={() => navigate('home')} />;
  }

  // Homepage remains intact — zero administrative data exposed before login
  return (
    <HomePage
      isAuthenticated={Boolean(session)}
      onOpenLogin={() => navigate('login')}
      onOpenDashboard={() => navigate('dashboard')}
      onOpenInstallPage={() => navigate('install')}
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
