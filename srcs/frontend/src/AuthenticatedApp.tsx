import React, { useState, useEffect } from "react";
import { Routes, Route, useNavigate, Navigate, useLocation } from "react-router-dom";
import { useLanguage } from "./i18n";

// Components
import UserMenu from "./userMenu";
import ChatInputComponent from "./chatInputComponent";
import PongComponent from "./pongComponent";
import GDPRPage from "./GDPRPage";
import FriendshipNotifications from "./friendshipNotifications";
import FriendsManager from "./friendsManager";
import PongInvitationHandler from "./pongInvitationHandler";
import PongInviteNotifications, { PongInvitation } from "./pongInviteNotifications";
import AccessibilitySettings from "./accessibilitySettings";
import LanguageSwitcher from "./components/LanguageSwitcher";

import { useGlobalStore } from "./features/global/store/globalStore";
import { useWebSocket } from "./socketComponent";
import { user_url } from "@app/shared/api/service/common/endpoints";
import { HandlerResult } from "./socketComponent";
import { AuthResponseType } from "@app/shared/api/service/auth/loginResponse";
import ProfileModal from "./components/modals/profileModal";

interface AuthenticatedAppProps {
  authResponse: AuthResponseType;
  onLogout: () => void;
}

export default function AuthenticatedApp({ authResponse, onLogout }: AuthenticatedAppProps) {

    const setCurrentUserId = useGlobalStore((state) => state.me.state.setCurrentUserId);

    useEffect(() => {
        setCurrentUserId(authResponse.user.id);
    }, [authResponse.user.id, setCurrentUserId]);

    const navigate = useNavigate();
    const location = useLocation();
    const { t, isRTL } = useLanguage();

    const [showFriendsManager, setShowFriendsManager] = useState(false);
  const [showAccessibilitySettings, setShowAccessibilitySettings] = useState(false);
  const [pongInvitations, setPongInvitations] = useState<PongInvitation[]>([]);
  const [showPongInviteModal, setShowPongInviteModal] = useState(false);
  const [pongInviteRoomUsers, setPongInviteRoomUsers] = useState<Array<{ id: number; username: string; onlineStatus?: number }>>([]);
  const [acceptedLobbyId, setAcceptedLobbyId] = useState<number | null>(null);
  const [accessibilitySettings, setAccessibilitySettings] = useState({
    highContrast: false,
    largeText: false,
    reducedMotion: false,
    screenReaderMode: false,
  });

  // --- Accessibility Effect ---
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('high-contrast', accessibilitySettings.highContrast);
    root.classList.toggle('reduce-motion', accessibilitySettings.reducedMotion);
    
    if (accessibilitySettings.largeText) root.style.fontSize = '18px';
    else root.style.fontSize = '';
  }, [accessibilitySettings]);

  return (
    <div className={`flex flex-col h-screen overflow-hidden bg-slate-900 text-gray-100 font-sans ${isRTL ? 'rtl' : 'ltr'}`}>
      
      {/* Global Logic Controllers (Headless components) */}
      <PongInvitationHandler authResponse={authResponse} setPongInvitations={setPongInvitations} />
      
      {/* Global UI Overlays */}
      <PongInviteNotifications 
         invitations={pongInvitations} 
         onAccept={() => navigate('/pong')} 
         onDecline={(id) => setPongInvitations(prev => prev.filter(i => i.inviteId !== id))}
      />

      <ProfileModal />

      {/* Main Layout Header */}
      <header className="flex-none bg-slate-800/90 border-b border-slate-700 shadow-md z-20">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <h1 className="text-xl font-bold tracking-tight text-white">TRANSCENDENCE</h1>
            <nav className="hidden md:flex items-center gap-1">
              <button 
                onClick={() => navigate('/chat')} 
                className={`px-3 py-2 rounded-md transition-colors ${location.pathname === '/chat' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-slate-700'}`}
              >
                {t('nav.chat')}
              </button>
              <button 
                onClick={() => navigate('/pong')} 
                className={`px-3 py-2 rounded-md transition-colors ${location.pathname === '/pong' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-slate-700'}`}
              >
                {t('nav.pong')}
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <button onClick={() => setShowAccessibilitySettings(true)} className="p-2 text-gray-300 hover:text-white">⚙️</button>
            <FriendshipNotifications isLoading={false} />
            <UserMenu
              username={authResponse.user.username}
              userId={authResponse.user.id}
              avatarUrl={authResponse.user.avatarUrl || ''}
              onLogout={onLogout}
              isLoggingOut={false}
              onFriendsClick={() => setShowFriendsManager(true)}
            />
          </div>
        </div>
      </header>

      {/* Routes */}
      <main className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 p-4 overflow-auto">
           <div className="max-w-7xl mx-auto h-full flex flex-col">
              <div className="flex-1 bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl shadow-2xl overflow-hidden relative">
                <Routes>
                  <Route path="/" element={<Navigate to="/chat" replace />} />
                  <Route path="/chat" element={
                    <ChatInputComponent 
                       selfUserId={authResponse.user.id} 
                       onOpenPongInvite={(roomUsers) => {
                         setPongInviteRoomUsers(roomUsers);
                         setShowPongInviteModal(true);
                         navigate('/pong');
                       }}
                    />
                  } />
                  <Route path="/pong" element={
                    <PongComponent
                      authResponse={authResponse}
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
                      onNavigateToChat={() => navigate('/chat')}
                    />
                  } />
                  <Route path="/gdpr" element={<GDPRPage showToast={() => {}} onNavigateBack={() => navigate('/')} />} />
                </Routes>
              </div>
           </div>
        </div>
      </main>

      {/* Modals */}
      {showFriendsManager && <FriendsManager isOpen={showFriendsManager} onClose={() => setShowFriendsManager(false)} />}
      {showAccessibilitySettings && (
         <AccessibilitySettings 
            isOpen={showAccessibilitySettings} 
            onClose={() => setShowAccessibilitySettings(false)}
            settings={accessibilitySettings}
            onUpdateSettings={setAccessibilitySettings} 
         />
      )}
    </div>
  );
}