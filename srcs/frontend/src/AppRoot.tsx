import { GlobalSocketListeners } from "./features/global/listeners/GlobalSocketListeners";
import SocketComponent, { closeGlobalSocket } from "./socketComponent";
import LoginComponent from "./loginComponent";
import RegisterComponent from "./registerComponent";
import { useState, useEffect } from "react";
import { FriendshipProvider } from "./friendshipContext";
import CookieBanner from "./CookieBanner";
import StarfieldBackground from "./StarfieldBackground";
import { useLanguage } from "./i18n";
import LanguageSwitcher from "./components/LanguageSwitcher";
import AuthenticatedApp from "./AuthenticatedApp";
import { enableMapSet } from "immer";
import type { AuthResponseType } from "@app/shared/api/service/auth/loginResponse";

import { apiCall } from "@utils/useApi";
import { pub_url } from "@app/shared/api/service/common/endpoints";
import { ToastContainer } from "./features/toast/toastContainer";
import { toast, useToastStore } from "./features/toast/toastStore";

// Enable Map and Set support in Immer for better state management with complex data structures
enableMapSet();

interface accessibilitySettings {
  highContrast: boolean;
  largeText: boolean;
  reducedMotion: boolean;
  screenReaderMode: boolean;
};

export default function AppRoot() {
  const { t, isRTL } = useLanguage();
  const [authResponse, setAuthResponse] = useState<AuthResponseType | null>(null);

  const showToast = useToastStore(state => state.showToast);

  const [accessibilitySettings, setAccessibilitySettings] = useState<accessibilitySettings>({
    highContrast: false,
    largeText: false,
    reducedMotion: false,
    screenReaderMode: false,
  });

  useEffect(() => {
    document.title = 'Transcendence 42';
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    root.classList.toggle('high-contrast', accessibilitySettings.highContrast);
    root.classList.toggle('reduce-motion', accessibilitySettings.reducedMotion);
    root.classList.toggle('screen-reader-mode', accessibilitySettings.screenReaderMode);
    root.classList.toggle('large-text', accessibilitySettings.largeText);
  }, [accessibilitySettings]);

  const [isAutoLoggingIn, setIsAutoLoggingIn] = useState<boolean>(true);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  function handleAuthResponse(data: AuthResponseType) {
    localStorage.setItem('jwt', data.tokens.jwt);
    localStorage.setItem('refreshToken', data.tokens.refresh);
    localStorage.setItem('userData', JSON.stringify(data.user));
    setAuthResponse(data);
  }

  function removeAuthResponse() {
    localStorage.removeItem('jwt');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userData');
    setAuthResponse(null);
  }

  // Attempt auto-login on app start
  useEffect(() => {
    async function tryAutoLogin() {
      if (authResponse) {
        setIsAutoLoggingIn(false);
        return;
      }

      setIsAutoLoggingIn(true);

      const hash = window.location.hash;
      let jwtToken: string | null = null;
      let refreshToken: string | null = null;

      if (hash && hash.length > 1) {
        const hashParams = new URLSearchParams(hash.substring(1));
        jwtToken = hashParams.get('jwt');
        refreshToken = hashParams.get('refresh');
      }

      if (!jwtToken) {
        const urlParams = new URLSearchParams(window.location.search);
        jwtToken = urlParams.get('jwt');
        refreshToken = urlParams.get('refresh');
      }

      if (jwtToken && refreshToken) {
        localStorage.setItem("jwt", jwtToken);
        localStorage.setItem("refreshToken", refreshToken);
      } else {
        jwtToken = localStorage.getItem("jwt");
        refreshToken = localStorage.getItem("refreshToken");
      }

      if (jwtToken && refreshToken) {
        console.log("Attempting auto-login with tokens from URL or localStorage");
        const validateRes = await apiCall(pub_url.http.auth.refreshToken, {
          body: { token: refreshToken }
        });

        if (validateRes.code === 200) {
          handleAuthResponse(validateRes.payload);
          setIsAutoLoggingIn(false);
          return;
        } else {
          console.warn("Auto-login token validation failed:", validateRes);
          removeAuthResponse();
          setIsAutoLoggingIn(false);
          return;
        }

      } else {
        console.log("Auto login failed: No tokens found in URL or localStorage");
        removeAuthResponse();
        setIsAutoLoggingIn(false);
        return;
      }
    }

    tryAutoLogin();
  }, []);

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try { closeGlobalSocket(); } catch { }

    try {
      let backendOk = false;
      const jwt = localStorage.getItem('jwt');

      if (authResponse?.user?.id && jwt) {
        try {
          const res = await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${jwt}`
            },
            body: JSON.stringify({ userId: authResponse.user.id })
          });
          if (res.ok) backendOk = true;
        } catch { }
      }

      localStorage.removeItem('jwt');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('userData');
      sessionStorage.removeItem('jwt');

      setAuthResponse(null);

      showToast(
        backendOk ? 'Logged out successfully' : 'Logged out locally (server revoke may have failed)',
        backendOk ? 'success' : 'error'
      );
    } finally {
      setIsLoggingOut(false);
    }
  }

  // Handle token expiration and refresh logic globally
  useEffect(() => {
    if (!authResponse) return;
    const refreshInterval = setInterval(async () => {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        removeAuthResponse();
        return;
      }

      const res = await apiCall(pub_url.http.auth.refreshToken, {
        body: { token: refreshToken }
      });

      if (res.code === 200) {
        handleAuthResponse(res.payload);
      } else {
        console.warn("Token refresh failed:", res);
        toast.error("Session expired. Please log in again.");
        removeAuthResponse();
      }
    }, 10 * 60 * 1000); // Refresh every 10 minutes

    return () => clearInterval(refreshInterval);
  }, [authResponse])

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-fixed"
      style={{ backgroundColor: 'transparent' }}
    >
      {/* Starfield animation background - behind everything */}
      <StarfieldBackground starCount={500} speed={4} backgroundImage="/static/react_dist/bg_dark.png" />
      <ToastContainer />

      <div className="relative">
        <CookieBanner />

        {authResponse ? (
          <FriendshipProvider>
            <SocketComponent AuthResponseObject={authResponse}>
              <StarfieldBackground starCount={300} />
              <CookieBanner />
              <GlobalSocketListeners />

              <AuthenticatedApp
                authResponse={authResponse}
                onLogout={handleLogout}
              />
            </SocketComponent>
          </FriendshipProvider>
        ) : (
          <div className="min-h-screen flex items-center justify-center py-12 px-4">
            {isAutoLoggingIn ? (
              <div>{t('app.restoringSession')}</div>
            ) : (
              <div className="max-w-4xl w-full space-y-8">
                <div className="text-center">
                  <h2 className="text-3xl font-bold text-white">{t('app.welcome')}</h2>
                  <div className="mt-4 flex justify-center">
                    <LanguageSwitcher />
                  </div>
                </div>

                <div className="mt-8 py-8 px-4">
                  <div className={`grid grid-cols-2 gap-8 ${isRTL ? 'direction-rtl' : ''}`}>
                    <div>
                      <LoginComponent onLoginSuccess={handleAuthResponse} />
                    </div>
                    <div>
                      <RegisterComponent whenCompletedSuccesfully={handleAuthResponse} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
