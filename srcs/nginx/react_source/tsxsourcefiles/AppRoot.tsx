// Full updated AppRoot.tsx with border fix and chat-only scrolling
// (Insert your import statements here exactly as before)

import SocketComponent, { closeGlobalSocket } from "./socketComponent";
import LoginComponent from "./loginComponent";
import PongComponent from "./pongComponent";
import ChatInputComponent from "./chatInputComponent";
import RegisterComponent from "./registerComponent";
import React, { useState, useEffect } from "react";
import { AuthResponseType } from "../../../nodejs_base_image/utils/api/service/auth/loginResponse";
import { FriendshipProvider } from "./friendshipContext";
import FriendshipNotifications from "./friendshipNotifications";
import FriendsManager from "./friendsManager";
import UserMenu from "./userMenu";

export default function AppRoot() {
  const [authResponse, setAuthResponse] = useState<AuthResponseType | null>(null);
  const [currentPage, setCurrentPage] = useState<'chat' | 'pong'>('chat');
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  const toggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    if (newDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('darkMode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('darkMode', 'false');
    }
  };

  function logInOrRegistered(varTypeAuthResponse: AuthResponseType) {
    setAuthResponse(varTypeAuthResponse);
    if (varTypeAuthResponse?.user) {
      try {
        localStorage.setItem('userData', JSON.stringify(varTypeAuthResponse.user));
      } catch (e) {
        console.warn("Could not persist user data:", e);
      }
    }
  }

  // Fetch user avatar when authResponse changes
  useEffect(() => {
    const fetchAvatar = async () => {
      // Get the latest user data from localStorage
      const userData = localStorage.getItem('userData');
      const user = userData ? JSON.parse(userData) : authResponse?.user;
      
      if (user?.id && user?.avatar) {
        try {
          const response = await fetch(`/api/users/pfp`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('jwt')}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ file: user.avatar })
          });
          if (response.ok) {
            const base64 = await response.text();
            setUserAvatarUrl(`data:image/png;base64,${base64}`);
          }
        } catch (err) {
          console.warn('Failed to fetch user avatar:', err);
        }
      }
    };

    fetchAvatar();

    // Listen for storage events to refresh avatar when profile is updated
    const handleStorageChange = () => {
      fetchAvatar();
    };
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [authResponse?.user?.id, authResponse?.user?.avatar]);

  const [isAutoLoggingIn, setIsAutoLoggingIn] = useState<boolean>(true);
  const [isGuestLoading, setIsGuestLoading] = useState<boolean>(false);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);
  const [showFriendsManager, setShowFriendsManager] = useState<boolean>(false);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | undefined>(undefined);

  function persistAuthTokens(data: any) {
    try {
      if (data?.tokens?.jwt) localStorage.setItem("jwt", data.tokens.jwt);
      if (data?.tokens?.refresh) localStorage.setItem("refreshToken", data.tokens.refresh);
    } catch (e) {
      console.warn("Could not persist tokens:", e);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function tryAutoLogin() {
      setIsAutoLoggingIn(true);
      if (authResponse) {
        setIsAutoLoggingIn(false);
        return;
      }

      const localRefresh = localStorage.getItem("refreshToken");
      try {
        if (localRefresh) {
          const res = await fetch("/public_api/auth/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ token: localRefresh })
          });

          if (res.ok) {
            const data = await res.json();
            if (!cancelled) {
              persistAuthTokens(data);
              if (data?.user) localStorage.setItem('userData', JSON.stringify(data.user));
              setAuthResponse(data);
            }
            setIsAutoLoggingIn(false);
            return;
          } else {
            localStorage.removeItem("refreshToken");
          }
        }

        const res2 = await fetch("/public_api/auth/refresh", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });

        if (res2.ok) {
          const data2 = await res2.json();
          if (!cancelled) {
            persistAuthTokens(data2);
            if (data2?.user) localStorage.setItem('userData', JSON.stringify(data2.user));
            setAuthResponse(data2);
          }
          setIsAutoLoggingIn(false);
          return;
        }
      } catch (err) {
        console.warn("Auto-login failed:", err);
      }

      if (!cancelled) setIsAutoLoggingIn(false);
    }

    tryAutoLogin();
    return () => { cancelled = true; };
  }, []);

  async function handleGuestLogin() {
    setIsGuestLoading(true);
    try {
      const res = await fetch("/public_api/auth/create/guest", { method: "GET" });
      if (!res.ok) throw new Error("Guest creation failed");
      const data = await res.json();
      persistAuthTokens(data);
      setAuthResponse(data);
    } catch (err: any) {
      alert("Guest login failed: " + (err?.message || "unknown"));
    } finally {
      setIsGuestLoading(false);
    }
  }

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error' | null>(null);

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try { closeGlobalSocket(); } catch {}

    try {
      let backendOk = false;
      const jwt = localStorage.getItem('jwt');

      if (authResponse?.user?.id && jwt) {
        try {
          const res = await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: authResponse.user.id })
          });
          if (res.ok) backendOk = true;
        } catch {}
      }

      localStorage.removeItem('jwt');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('userData');
      sessionStorage.removeItem('jwt');

      setAuthResponse(null);

      setToastType(backendOk ? 'success' : 'error');
      setToastMessage(backendOk ? 'Logged out successfully' : 'Logged out locally (server revoke may have failed)');

      setTimeout(() => { setToastMessage(null); setToastType(null); }, 3000);
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-fixed transition-colors duration-200"
      style={{ backgroundImage: darkMode ? 'url(/static/react_dist/bg_dark.jpg)' : 'url(/static/react_dist/bg_light.jpg)' }}
    >
      <div className="fixed inset-0 bg-black/5 dark:bg-black/20 pointer-events-none"></div>

      <div className="relative z-10">
        {toastMessage && (
          <div className={`fixed top-6 right-6 z-50 px-4 py-2 rounded shadow-md ${toastType === 'success' ? 'bg-green-600' : 'bg-red-600'} text-white`}>
            {toastMessage}
          </div>
        )}

        {authResponse ? (
          <FriendshipProvider>
            <SocketComponent AuthResponseObject={authResponse}>
              <div className="flex flex-col h-screen">
                <header className="bg-white dark:bg-dark-800 shadow dark:shadow-dark-700">
                  <div className="max-w-5xl mx-auto px-4 py-4">
                    <div className="flex justify-between items-center">
                      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Transcendence</h1>
                      <div className="flex items-center space-x-4">
                        <nav className="flex space-x-4">
                          <button
                            onClick={() => setCurrentPage('chat')}
                            className={`px-4 py-2 rounded-md ${currentPage === 'chat' ? 'bg-blue-500 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700'}`}
                          >Chat</button>
                          <button
                            onClick={() => setCurrentPage('pong')}
                            className={`px-4 py-2 rounded-md ${currentPage === 'pong' ? 'bg-blue-500 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700'}`}
                          >Pong</button>
                        </nav>

                        <button onClick={toggleDarkMode} className="p-2 rounded-md">
                          {darkMode ? (
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                          ) : (
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                            </svg>
                          )}
                        </button>

                        <FriendshipNotifications isLoading={false} />

                        <UserMenu
                          username={authResponse.user.username}
                          userId={authResponse.user.id}
                          avatarUrl={userAvatarUrl}
                          onLogout={handleLogout}
                          isLoggingOut={isLoggingOut}
                          onFriendsClick={() => setShowFriendsManager(true)}
                        />
                      </div>
                    </div>
                  </div>
                </header>

                <main className="flex-1 overflow-hidden flex justify-center">
                  <div className="w-full max-w-5xl px-4 py-6 flex flex-col">

                    {/* Card wrapper (fixes border clipping) */}
                    <div className="rounded-lg shadow dark:shadow-dark-700 h-full">
                      <div className="bg-white dark:bg-dark-800 rounded-lg h-full flex flex-col">

                        {currentPage === 'chat' ? (
                          // CHAT PAGE — only inner content scrolls
                          <div className="p-6 h-full flex flex-col">
                            <div className="flex-1 overflow-hidden">
                              <ChatInputComponent selfUserId={authResponse.user.id} />
                            </div>
                          </div>
                        ) : (
                          // PONG PAGE — no scroll
                          <div className="p-6 h-full flex">
                            <PongComponent authResponse={authResponse} darkMode={darkMode} />
                          </div>
                        )}

                      </div>
                    </div>

                  </div>
                </main>

                {showFriendsManager && (
                  <FriendsManager isOpen={showFriendsManager} onClose={() => setShowFriendsManager(false)} />
                )}

              </div>
            </SocketComponent>
          </FriendshipProvider>
        ) : (
          <div className="min-h-screen flex items-center justify-center py-12 px-4">
            {isAutoLoggingIn ? (
              <div>Restoring session…</div>
            ) : (
              <div className="max-w-4xl w-full space-y-8">
                <div className="text-center">
                  <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Welcome to Transcendence</h2>
                  <button onClick={toggleDarkMode} className="mt-4 p-2">
                    {darkMode ? (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      </svg>
                    )}
                  </button>
                </div>

                <div className="mt-8 bg-white dark:bg-dark-800 py-8 px-4 shadow rounded-lg">
                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <h3 className="text-lg font-medium mb-4">Log In</h3>
                      <LoginComponent onLoginSuccess={logInOrRegistered} />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium mb-4">Register</h3>
                      <RegisterComponent whenCompletedSuccesfully={logInOrRegistered} />
                    </div>
                  </div>

                  <div className="mt-6 flex justify-center">
                    <button
                      onClick={handleGuestLogin}
                      className="bg-gray-100 dark:bg-dark-700 px-6 py-2 rounded-lg"
                    >Continue as Guest</button>
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
