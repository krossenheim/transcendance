import React, { useState, useEffect } from "react";
import { Routes, Route, useNavigate, Navigate, useLocation } from "react-router-dom";
import { useLanguage } from "./i18n";

// Components
import PongComponent from "./pongComponent";
import GDPRPage from "./GDPRPage";
import PongInvitationHandler from "./pongInvitationHandler";
import PongInviteNotifications, { PongInvitation } from "./pongInviteNotifications";
import AccessibilitySettings from "./accessibilitySettings";

import { useGlobalStore } from "./features/global/store/globalStore";
import { AuthResponseType } from "@app/shared/api/service/auth/loginResponse";
import ProfileModal from "./features/global/modals/profile/profileModal";
import ChatPage from "./pages/chat";
import UserConnectionsModal from "./features/global/modals/userConnections/userConnectionsModal";
import TopHeaderBar from "./features/global/widgets/topHeaderBar";

interface AuthenticatedAppProps {
  authResponse: AuthResponseType;
  onLogout: () => void;
}

export default function AuthenticatedApp({ authResponse, onLogout }: AuthenticatedAppProps) {
  const setCurrentUserId = useGlobalStore((state) => state.me.state.setCurrentUserId);

  useEffect(() => {
    setCurrentUserId(authResponse.user.id);
  }, [authResponse.user.id, setCurrentUserId]);

  useEffect(() => {
    useGlobalStore.getState().users.state.cachePublicUserData({ ...authResponse.user, onlineStatus: null });
  }, [authResponse.user])

    const navigate = useNavigate();
    const { isRTL } = useLanguage();

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

      {/* Modals */}
      <ProfileModal />
      <UserConnectionsModal />

      {/* Main Layout Header */}
      <TopHeaderBar
        onLogout={onLogout}
        isLoggingOut={false}
      />

      {/* Routes */}
      <main className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 p-4 overflow-auto">
           <div className="max-w-7xl mx-auto h-full flex flex-col">
              <div className="flex-1 bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl shadow-2xl overflow-hidden relative">
                <Routes>
                  <Route path="/" element={<Navigate to="chat" replace />} />
                  <Route path="/chat" element={
                    <ChatPage />
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