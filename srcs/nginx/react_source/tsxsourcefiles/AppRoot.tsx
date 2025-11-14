import SocketComponent, { closeGlobalSocket } from "./socketComponent";
import LoginComponent from "./loginComponent";
import PongComponent from "./pongComponent";
import ChatInputComponent from "./chatInputComponent";
import RegisterComponent from "./registerComponent";
import React, { useState, useEffect } from "react";
import { AuthResponseType } from "../../../nodejs_base_image/utils/api/service/auth/loginResponse";
import { FriendshipProvider } from "./friendshipContext";
import FriendshipNotifications from "./friendshipNotifications";

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
  }

  const [isAutoLoggingIn, setIsAutoLoggingIn] = useState<boolean>(true);
  const [isGuestLoading, setIsGuestLoading] = useState<boolean>(false);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  // Persist tokens helper
  function persistAuthTokens(data: any) {
    try {
      if (data?.tokens?.jwt) {
        localStorage.setItem("jwt", data.tokens.jwt);
      }
      if (data?.tokens?.refresh) {
        localStorage.setItem("refreshToken", data.tokens.refresh);
      }
    } catch (e) {
      console.warn("Could not persist tokens:", e);
    }
  }

  // Try to auto-login using refresh token (localStorage first, then cookie-based)
  useEffect(() => {
    let cancelled = false;

    async function tryAutoLogin() {
      setIsAutoLoggingIn(true);

      // If already logged in, skip
      if (authResponse) {
        setIsAutoLoggingIn(false);
        return;
      }

      // 1) Try using stored refresh token
      const localRefresh = localStorage.getItem("refreshToken");
      try {
        if (localRefresh) {
          const res = await fetch("/public_api/auth/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ token: localRefresh }),
          });

          if (res.ok) {
            const data = await res.json();
            if (!cancelled) {
              persistAuthTokens(data);
              setAuthResponse(data);
            }
            setIsAutoLoggingIn(false);
            return;
          } else {
            // clear invalid stored refresh token
            localStorage.removeItem("refreshToken");
          }
        }

        // 2) Try cookie-based refresh (server may set refresh cookie)
        const res2 = await fetch("/public_api/auth/refresh", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });

        if (res2.ok) {
          const data2 = await res2.json();
          if (!cancelled) {
            persistAuthTokens(data2);
            setAuthResponse(data2);
          }
          setIsAutoLoggingIn(false);
          return;
        }
      } catch (err) {
        console.warn("Auto-login/refresh failed:", err);
      }

      if (!cancelled) setIsAutoLoggingIn(false);
    }

    tryAutoLogin();

    return () => { cancelled = true };
  }, []);

  // Guest login action
  async function handleGuestLogin() {
    setIsGuestLoading(true);
    try {
      const res = await fetch("/public_api/auth/create/guest", {
        method: "GET",
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "Guest creation failed");
        throw new Error(txt || `Status ${res.status}`);
      }
      const data = await res.json();
      persistAuthTokens(data);
      setAuthResponse(data);
    } catch (err: any) {
      console.error("Guest login failed:", err);
      alert("Guest login failed: " + (err?.message || "unknown"));
    } finally {
      setIsGuestLoading(false);
    }
  }

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastType, setToastType] = useState<'success' | 'error' | null>(null)

  // Logout action - call backend to revoke refresh token
  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    // Close socket immediately so no further WS messages arrive
    try {
      closeGlobalSocket()
    } catch (e) {
      console.warn('Error while closing global socket:', e)
    }

    try {
      // Attempt to notify backend to revoke refresh token for this user
      let backendOk = false
      const jwt = localStorage.getItem('jwt');
      if (authResponse && authResponse.user && typeof authResponse.user.id === 'number' && jwt) {
        try {
          const res = await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ userId: authResponse.user.id }),
          });

          if (!res.ok) {
            const txt = await res.text().catch(() => `Status ${res.status}`);
            console.warn('Backend logout returned non-OK:', txt);
          } else {
            backendOk = true
          }
        } catch (err) {
          console.warn('Error calling backend logout:', err);
        }
      }

      // Always clear local tokens and auth state locally
      try {
        localStorage.removeItem('jwt');
        localStorage.removeItem('refreshToken');
        // Clear any cached auth artifacts to prevent phantom refresh attempts
        sessionStorage.removeItem('jwt');
      } catch (e) {
        console.warn('Error clearing tokens on logout:', e);
      }

      setAuthResponse(null);

      // Show toast based on result
      if (backendOk) {
        setToastType('success')
        setToastMessage('Logged out successfully')
      } else {
        setToastType('error')
        setToastMessage('Logged out locally; server revoke may have failed')
      }

      // Auto-hide toast after 3s
      setTimeout(() => {
        setToastMessage(null)
        setToastType(null)
      }, 3000)
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <div 
      className={`min-h-screen bg-cover bg-center bg-fixed transition-colors duration-200`}
      style={{
        backgroundImage: darkMode 
          ? 'url(/static/react_dist/bg_dark.jpg)' 
          : 'url(/static/react_dist/bg_light.jpg)',
      }}
    >
      {/* Semi-transparent overlay for better text readability */}
      <div className="fixed inset-0 bg-black/5 dark:bg-black/20 pointer-events-none"></div>
      
      <div className="relative z-10">
        {/* Toast */}
        {toastMessage && (
          <div className={`fixed top-6 right-6 z-50 px-4 py-2 rounded shadow-md ${toastType === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
            {toastMessage}
          </div>
        )}
        {authResponse ? (
        <FriendshipProvider>
          <SocketComponent AuthResponseObject={authResponse}>
            <div className="flex flex-col h-screen">
              {/* Header */}
              <header className="bg-white dark:bg-dark-800 shadow dark:shadow-dark-700">
                <div className="max-w-5xl mx-auto px-4 py-4">
                  <div className="flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Transcendence</h1>
                    <div className="flex items-center space-x-4">
                      <nav className="flex space-x-4">
                        <button
                          onClick={() => setCurrentPage('chat')}
                          className={`px-4 py-2 rounded-md ${
                            currentPage === 'chat'
                              ? 'bg-blue-500 text-white'
                              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700'
                          }`}
                        >
                          Chat
                        </button>
                        <button
                          onClick={() => setCurrentPage('pong')}
                          className={`px-4 py-2 rounded-md ${
                            currentPage === 'pong'
                              ? 'bg-blue-500 text-white'
                              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700'
                          }`}
                        >
                          Pong
                        </button>
                    </nav>

                    <button
                      onClick={toggleDarkMode}
                      className="p-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700"
                      title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                    >
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

                    <button
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className={`ml-2 px-3 py-1 rounded ${isLoggingOut ? 'bg-red-200 text-red-600 cursor-not-allowed' : 'bg-red-100 dark:bg-red-700 text-red-800 dark:text-red-100 hover:bg-red-200 dark:hover:bg-red-600'}`}
                      title="Log out"
                    >
                      {isLoggingOut ? 'Logging out...' : 'Log out'}
                    </button>
                  </div>
                </div>
              </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-hidden flex justify-center">
              <div className="w-full max-w-5xl px-4 py-6 flex flex-col">
                <div className="bg-white dark:bg-dark-800 rounded-lg shadow dark:shadow-dark-700 flex-1 overflow-hidden flex flex-col">
                  {currentPage === 'chat' ? (
                    <div className="p-6">
                      <ChatInputComponent selfUserId={authResponse.user.id} />
                    </div>
                  ) : (
                    <div className="p-6 flex-1 flex overflow-hidden">
                      <PongComponent />
                    </div>
                  )}
                </div>
              </div>
            </main>
          </div>
        </SocketComponent>
        </FriendshipProvider>
      ) : (
        <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
          {isAutoLoggingIn ? (
            <div className="flex flex-col items-center space-y-4">
              <svg className="animate-spin h-12 w-12 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
              </svg>
              <div className="text-gray-700 dark:text-gray-300">Restoring your session...</div>
            </div>
          ) : (
            <div className="max-w-4xl w-full space-y-8">
              <div className="flex flex-col items-center">
                <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
                  Welcome to Transcendence
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
                  Please log in or create an account to continue
                </p>
                <button
                  onClick={toggleDarkMode}
                  className="mt-4 p-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-700"
                  title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                >
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
              
              <div className="mt-8 bg-white dark:bg-dark-800 py-8 px-4 shadow sm:rounded-lg sm:px-10 dark:shadow-dark-700">
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Log In</h3>
                    <LoginComponent onLoginSuccess={logInOrRegistered} />
                  </div>
                  <div className="border-l dark:border-dark-700 pl-8">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Register</h3>
                    <RegisterComponent whenCompletedSuccesfully={logInOrRegistered} />
                  </div>
                </div>
                <div className="mt-6 flex items-center justify-center">
                  <button
                    onClick={handleGuestLogin}
                    className="bg-gray-100 dark:bg-dark-700 text-gray-800 dark:text-gray-200 px-6 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-dark-600 transition"
                  >
                    Continue as Guest
                  </button>
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
