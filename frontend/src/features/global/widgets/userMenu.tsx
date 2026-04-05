import { useUserConnectionsModalStore } from "@features/global/modals/userConnections/userConnectionsModalStore";
import { useProfileModalStore } from "@features/global/modals/profile/profileModalStore";
import { useGlobalStore } from "@features/global/store/globalStore";
import { useState, useEffect, useRef } from "react";
import { getVisualUserName } from "@utils/users";
import { useNavigate } from "react-router-dom";
import { getUserColorCSS } from "@utils/users";
import { useLanguage } from "@src/i18n";

interface UserMenuProps {
  onLogout: () => void;
  isLoggingOut: boolean;
}

export default function UserMenu({ onLogout, isLoggingOut }: UserMenuProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { t, isRTL } = useLanguage();

  const currentUserId = useGlobalStore((state) => state.me.data.currentUserId);
  const currentUserData = useGlobalStore((state) => state.users.data.userCache.get(currentUserId || -1));

  console.log("Current user data in UserMenu:", currentUserData, currentUserId);
  const userColor = getUserColorCSS(currentUserId || 0);

  const openUserConnectionsModal = useUserConnectionsModalStore(state => state.openUserConnectionsModal);
  const openProfileModal = useProfileModalStore(state => state.openProfileModal);

  const navigate = useNavigate();

  useEffect(() => {
    if (!currentUserData?.avatarUrl) return;
    useGlobalStore.getState().users.actions.fetchUserProfileUrl(currentUserData.avatarUrl).then(result => {
      if (result.isOk()) {
        setAvatarUrl(result.unwrap());
      } else {
        console.error("Failed to fetch avatar URL:", result.unwrapErr());
      }
    });
  }, [currentUserData]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }

    return;
  }, [isDropdownOpen]);

  const username = getVisualUserName(currentUserData, currentUserId || undefined);

  return (
    <div className="relative z-[9999]" ref={dropdownRef}>
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="flex items-center gap-2 px-3 py-2 hover:bg-dark-700 transition-colors"
      >
        <div className="w-8 h-8 rounded-full overflow-hidden bg-dark-700 flex items-center justify-center">
          {avatarUrl ? (
            <img src={avatarUrl} alt={username} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-semibold text-gray-300">
              {username.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>

        <span className="text-sm font-bold" style={{ color: userColor }}>
          {username}
        </span>

        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isDropdownOpen ? "rotate-180" : ""
            }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isDropdownOpen && (
        <div className={`absolute ${isRTL ? 'left-0' : 'right-0'} mt-2 w-56 glass-dark-sm glass-border shadow-dark-700 py-2 z-[10000]`}>
          <div className="px-4 py-3 border-b border-dark-700">
            <p className="text-sm font-bold" style={{ color: userColor }}>{username}</p>
            <p className="text-xs text-gray-900 mt-1">{t('userMenu.userId')}: {currentUserId || "?"}</p>
          </div>

          <div className="py-1">
            <button
              onClick={() => {
                openProfileModal(currentUserId || -1);
                setIsDropdownOpen(false);
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-900 hover:bg-dark-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {t('userMenu.viewProfile')}
            </button>

            <button
              onClick={() => {
                setIsDropdownOpen(false);
                openUserConnectionsModal();
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-900 hover:bg-dark-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              {t('userMenu.manageFriends')}
            </button>

            <button
              onClick={() => {
                setIsDropdownOpen(false);
                navigate("/settings");
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-900 hover:bg-dark-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {t('userMenu.settings')}
            </button>
          </div>

          <div className="border-t border-dark-700 pt-1 mt-1">
            <button
              onClick={() => {
                setIsDropdownOpen(false);
                onLogout();
              }}
              disabled={isLoggingOut}
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${isLoggingOut
                ? "text-red-500 cursor-not-allowed"
                : "text-red-400 hover:bg-red-900/20"
                }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {isLoggingOut ? t('userMenu.loggingOut') : t('userMenu.logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

