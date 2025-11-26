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
import PongInviteNotifications, { type PongInvitation } from "./pongInviteNotifications";
import PongInvitationHandler from "./pongInvitationHandler";
import AccessibilitySettings from "./accessibilitySettings";

export default function AppRoot() {
  const [authResponse, setAuthResponse] = useState<AuthResponseType | null>(null);
  const [currentPage, setCurrentPage] = useState<'chat' | 'pong'>('chat');
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });
  const [showPongInviteModal, setShowPongInviteModal] = useState(false);
  const [pongInviteRoomUsers, setPongInviteRoomUsers] = useState<Array<{ id: number; username: string; onlineStatus?: number }>>([]);
  const [pongInvitations, setPongInvitations] = useState<PongInvitation[]>([]);
  const [acceptedLobbyId, setAcceptedLobbyId] = useState<number | null>(null);
  const [showAccessibilitySettings, setShowAccessibilitySettings] = useState(false);
  const [accessibilitySettings, setAccessibilitySettings] = useState({
    highContrast: false,
    largeText: false,
    reducedMotion: false,
    screenReaderMode: false,
  });

  // Debug: Log invitation state changes
  useEffect(() => {
    console.log("[AppRoot] pongInvitations updated:", pongInvitations);
  }, [pongInvitations]);

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

  // Apply accessibility settings to document
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    
    // High contrast - applies strong contrast and borders
    if (accessibilitySettings.highContrast) {
      root.classList.add('high-contrast');
      console.log('[Accessibility] High contrast mode enabled');
    } else {
      root.classList.remove('high-contrast');
    }
    
    // Large text - increases base font size
    if (accessibilitySettings.largeText) {
      root.style.fontSize = '18px';
      body.style.fontSize = '18px';
      console.log('[Accessibility] Large text mode enabled');
    } else {
      root.style.fontSize = '';
      body.style.fontSize = '';
    }
    
    // Reduced motion - disables all animations and transitions
    if (accessibilitySettings.reducedMotion) {
      root.classList.add('reduce-motion');
      // Also add preference to CSS
      const style = document.createElement('style');
      style.id = 'reduce-motion-override';
      style.textContent = `
        * {
          animation-play-state: paused !important;
          transition: none !important;
        }
      `;
      if (!document.getElementById('reduce-motion-override')) {
        document.head.appendChild(style);
      }
      console.log('[Accessibility] Reduced motion mode enabled');
    } else {
      root.classList.remove('reduce-motion');
      const existingStyle = document.getElementById('reduce-motion-override');
      if (existingStyle) {
        existingStyle.remove();
      }
    }
    
    // Screen reader mode - enhanced focus indicators and spacing
    if (accessibilitySettings.screenReaderMode) {
      root.classList.add('screen-reader-mode');
      console.log('[Accessibility] Screen reader mode enabled');
    } else {
      root.classList.remove('screen-reader-mode');
    }
  }, [accessibilitySettings]);

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
  }, [authResponse?.user?.id, authResponse?.user?.avatarUrl]);

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

      // Check for OAuth tokens in URL query parameters
      const urlParams = new URLSearchParams(window.location.search);
      const jwtFromUrl = urlParams.get('jwt');
      const refreshFromUrl = urlParams.get('refresh');
      
      if (jwtFromUrl && refreshFromUrl) {
        try {
          // Store tokens from OAuth callback
          localStorage.setItem("jwt", jwtFromUrl);
          localStorage.setItem("refreshToken", refreshFromUrl);
          
          // Validate the JWT by fetching user data
          const validateRes = await fetch("/public_api/auth/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: refreshFromUrl })
          });
          
          if (validateRes.ok) {
            const data = await validateRes.json();
            if (!cancelled) {
              persistAuthTokens(data);
              if (data?.user) localStorage.setItem('userData', JSON.stringify(data.user));
              setAuthResponse(data);
            }
            
            // Clean up URL by removing query parameters
            window.history.replaceState({}, document.title, window.location.pathname);
            setIsAutoLoggingIn(false);
            return;
          }
        } catch (e) {
          console.warn("OAuth token validation failed:", e);
        }
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

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error' | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToastMessage(message);
    setToastType(type);
    setTimeout(() => {
      setToastMessage(null);
      setToastType(null);
    }, 5000);
  };

  async function handleGuestLogin() {
    setIsGuestLoading(true);
    try {
      const res = await fetch("/public_api/auth/create/guest", { method: "GET" });
      if (!res.ok) throw new Error("Guest creation failed");
      const data = await res.json();
      persistAuthTokens(data);
      setAuthResponse(data);
    } catch (err: any) {
      showToast("Guest login failed: " + (err?.message || "unknown"), 'error');
    } finally {
      setIsGuestLoading(false);
    }
  }

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

      showToast(
        backendOk ? 'Logged out successfully' : 'Logged out locally (server revoke may have failed)',
        backendOk ? 'success' : 'error'
      );
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-fixed transition-colors duration-200"
      style={{ backgroundImage: darkMode ? 'url(/static/react_dist/bg_dark.png)' : 'url(/static/react_dist/bg_light.png)' }}
    >
      {/* Skip to main content for keyboard users */}
      <a href="#main-content" className="skip-to-main">
        Skip to main content
      </a>

      <div className="fixed inset-0 pointer-events-none z-0" style={{ backgroundColor: darkMode ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.05)' }}></div>

      <div className="relative">
        {toastMessage && (
          <div className={`fixed top-6 right-6 z-50 px-4 py-2 rounded shadow-md ${toastType === 'success' ? 'bg-green-600' : 'bg-red-600'} text-white`}>
            {toastMessage}
          </div>
        )}

        {authResponse ? (
          <FriendshipProvider>
            <SocketComponent AuthResponseObject={authResponse} showToast={showToast}>
              {/* Global Pong Invitation Handler */}
              <PongInvitationHandler 
                authResponse={authResponse}
                setPongInvitations={setPongInvitations}
              />
              
              {/* Global Pong Invitation Notifications */}
              <PongInviteNotifications
                invitations={pongInvitations}
                onAccept={(inviteId) => {
                  console.log("[AppRoot] Accepting invitation:", inviteId);
                  const invitation = pongInvitations.find(inv => inv.inviteId === inviteId);
                  if (invitation) {
                    setAcceptedLobbyId(invitation.lobbyId);
                    // Store the lobby data for PongComponent to use
                    if (invitation.lobbyData) {
                      (window as any).__acceptedLobbyData = invitation.lobbyData;
                    }
                  }
                  setPongInvitations((prev) => prev.filter((inv) => inv.inviteId !== inviteId));
                  setCurrentPage('pong'); // Switch to pong page
                }}
                onDecline={(inviteId) => {
                  console.log("[AppRoot] Declining invitation:", inviteId);
                  setPongInvitations((prev) => prev.filter((inv) => inv.inviteId !== inviteId));
                }}
              />
              
              <div className="flex flex-col h-screen">
                <header className="bg-white/90 dark:bg-gray-800/90 border-b border-gray-200 dark:border-gray-700 shadow dark:shadow-dark-700 relative">
                  <div className="max-w-5xl mx-auto px-4 py-4">
                    <div className="flex justify-between items-center">
                      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Transcendence</h1>
                      <div className="flex items-center space-x-4">
                        <nav className="flex space-x-4">
                          <button
                            onClick={() => setCurrentPage('chat')}
                            className={`px-4 py-2 ${currentPage === 'chat' ? 'bg-blue-500 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700'}`}
                          >Chat</button>
                          <button
                            onClick={() => setCurrentPage('pong')}
                            className={`px-4 py-2 ${currentPage === 'pong' ? 'bg-blue-500 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700'}`}
                          >Pong</button>
                        </nav>

                        <button onClick={toggleDarkMode} className="p-2" aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}>
                          {darkMode ? (
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                          ) : (
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                            </svg>
                          )}
                        </button>

                        <button onClick={() => setShowAccessibilitySettings(true)} className="p-2" aria-label="Open accessibility settings">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                          </svg>
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

                <main id="main-content" className="flex-1 overflow-hidden flex justify-center relative" role="main" style={{ zIndex: 1 }}>
                  <div className="w-full max-w-5xl px-4 py-6 flex flex-col">

                    {/* Card wrapper (fixes border clipping) */}
                    <div className="shadow dark:shadow-dark-700 h-full">
                      <div className="bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 h-full flex flex-col">

                        {currentPage === 'chat' ? (
                          // CHAT PAGE — only inner content scrolls
                          <div className="p-6 h-full flex flex-col">
                            <div className="flex-1 overflow-hidden">
                              <ChatInputComponent 
                                selfUserId={authResponse.user.id} 
                                showToast={showToast}
                                onOpenPongInvite={(roomUsers) => {
                                  setPongInviteRoomUsers(roomUsers);
                                  setShowPongInviteModal(true);
                                  setCurrentPage('pong'); // Switch to pong page
                                }}
                              />
                            </div>
                          </div>
                        ) : (
                          // PONG PAGE — no scroll
                          <div className="p-6 h-full flex">
                            <PongComponent 
                              authResponse={authResponse} 
                              darkMode={darkMode}
                              showInviteModal={showPongInviteModal}
                              inviteRoomUsers={pongInviteRoomUsers}
                              onCloseInviteModal={() => {
                                setShowPongInviteModal(false);
                                setPongInviteRoomUsers([]);
                              }}
                              pongInvitations={pongInvitations}
                              setPongInvitations={setPongInvitations}
                              acceptedLobbyId={acceptedLobbyId}
                              onLobbyJoined={() => setAcceptedLobbyId(null)}
                              onNavigateToChat={() => setCurrentPage('chat')}
                            />
                          </div>
                        )}

                      </div>
                    </div>

                  </div>
                </main>

                {showFriendsManager && (
                  <FriendsManager isOpen={showFriendsManager} onClose={() => setShowFriendsManager(false)} />
                )}

                {showAccessibilitySettings && (
                  <AccessibilitySettings
                    isOpen={showAccessibilitySettings}
                    onClose={() => setShowAccessibilitySettings(false)}
                    settings={accessibilitySettings}
                    onUpdateSettings={setAccessibilitySettings}
                  />
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

                <div className="mt-8 py-8 px-4">
                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <LoginComponent onLoginSuccess={logInOrRegistered} />
                    </div>
                    <div>
                      <RegisterComponent whenCompletedSuccesfully={logInOrRegistered} />
                    </div>
                  </div>

                  <div className="mt-6 flex justify-center">
                    <button
                      onClick={handleGuestLogin}
                      className="bg-gray-100 dark:bg-gray-700/80 px-6 py-2 hover:bg-gray-200 dark:hover:bg-gray-600/80 transition-colors"
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
