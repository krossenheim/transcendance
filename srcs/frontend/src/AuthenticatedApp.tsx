import React, { useState, useEffect, use } from "react";
import { Routes, Route, useNavigate, Navigate } from "react-router-dom";
import { useLanguage } from "./i18n";

// Components
import PongComponent from "./pongComponent";
import PongInvitationHandler from "./pongInvitationHandler";
import PongInviteNotifications, { PongInvitation } from "./pongInviteNotifications";
import SettingsPage from "./pages/settings"; // Imported the new page

import { useGlobalStore } from "@features/global/store/globalStore";
import { AuthResponseType } from "@app/shared/api/service/auth/loginResponse";
import ProfileModal from "@features/global/modals/profile/profileModal";
import ChatPage from "./pages/chat";
import UserConnectionsModal from "@features/global/modals/userConnections/userConnectionsModal";
import TopHeaderBar from "@features/global/widgets/topHeaderBar";

interface AuthenticatedAppProps {
  authResponse: AuthResponseType;
  onLogout: () => void;
}

export default function AuthenticatedApp({ authResponse, onLogout }: AuthenticatedAppProps) {
  useEffect(() => {
    useGlobalStore.getState().me.state.setCurrentUserData(authResponse.user);
    useGlobalStore.getState().users.state.cachePublicUserData({ ...authResponse.user, onlineStatus: null });
  }, [authResponse.user])

  const navigate = useNavigate();
  const { isRTL } = useLanguage();

  const [pongInvitations, setPongInvitations] = useState<PongInvitation[]>([]);
  const [showPongInviteModal, setShowPongInviteModal] = useState(false);
  const [pongInviteRoomUsers, setPongInviteRoomUsers] = useState<Array<{ id: number; username: string; onlineStatus?: number }>>([]);
  const [acceptedLobbyId, setAcceptedLobbyId] = useState<number | null>(null);

  const handleAcceptInvitation = (inviteId: number) => {
    // Find the invitation
    const invitation = pongInvitations.find(inv => inv.inviteId === inviteId);
    if (invitation) {
      // Store lobby data in window for PongComponent to pick up
      (window as any).__acceptedLobbyData = invitation.lobbyData;
      setAcceptedLobbyId(invitation.lobbyId);
      // Remove the invitation from list
      setPongInvitations(prev => prev.filter(i => i.inviteId !== inviteId));
    }
    navigate('/pong');
  };

  return (
    <div className={`flex flex-col h-screen overflow-hidden bg-transparent text-gray-100 font-sans ${isRTL ? 'rtl' : 'ltr'}`}>
      
      {/* Global Logic Controllers */}
      <PongInvitationHandler authResponse={authResponse} setPongInvitations={setPongInvitations} />
      
      {/* Global UI Overlays */}
      <PongInviteNotifications 
         invitations={pongInvitations} 
         onAccept={handleAcceptInvitation} 
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
                  <Route path="/chat" element={<ChatPage />} />
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
                  <Route path="/settings" element={<SettingsPage />} />
                </Routes>
              </div>
           </div>
        </div>
      </main>
    </div>
  );
}