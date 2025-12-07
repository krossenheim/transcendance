import React, { useState, useEffect, useRef } from "react";
import ProfileComponent from "./profileComponent";
import { getUserColorCSS } from "./userColorUtils";

interface UserMenuProps {
  username: string;
  userId: number;
  avatarUrl?: string;
  onLogout: () => void;
  isLoggingOut: boolean;
  onFriendsClick?: () => void;
}

export default function UserMenu({ username, userId, avatarUrl, onLogout, isLoggingOut, onFriendsClick }: UserMenuProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const userColor = getUserColorCSS(userId, true);

  // Close dropdown when clicking outside
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
  }, [isDropdownOpen]);

  return (
    <>
      {/* FIX #1 — add z-[9999] so the entire menu lives above everything */}
      <div className="relative z-[9999]" ref={dropdownRef}>
        {/* Username button with avatar */}
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100/40 dark:hover:bg-dark-700 transition-colors"
        >
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-200 dark:bg-dark-700 flex items-center justify-center">
            {avatarUrl ? (
              <img src={avatarUrl} alt={username} className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                {username.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          
          {/* Username */}
          <span className="text-sm font-bold" style={{ color: userColor }}>
            {username}
          </span>
          
          {/* Dropdown arrow */}
          <svg
            className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform ${
              isDropdownOpen ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Dropdown menu */}
        {isDropdownOpen && (
          // FIX #2 — Increase menu z-index to 10000 so it sits above AppRoot card
          <div className="absolute right-0 mt-2 w-56 glass-light-sm dark:glass-dark-sm glass-border shadow-lg dark:shadow-dark-700 py-2 z-[10000]">
            {/* User info header */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-700">
              <p className="text-sm font-bold" style={{ color: userColor }}>{username}</p>
              <p className="text-xs text-gray-900 mt-1">User ID: {userId}</p>
            </div>

            {/* Menu items */}
            <div className="py-1">
              <button
                onClick={() => {
                  setShowProfile(true);
                  setIsDropdownOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-900 hover:bg-gray-100/40 dark:hover:bg-dark-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                View my profile
              </button>

              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  onFriendsClick?.();
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-900 hover:bg-gray-100/40 dark:hover:bg-dark-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Manage friends
              </button>
            </div>

            {/* Logout button */}
            <div className="border-t border-gray-200 dark:border-dark-700 pt-1 mt-1">
              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  onLogout();
                }}
                disabled={isLoggingOut}
                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${
                  isLoggingOut
                    ? "text-red-400 dark:text-red-500 cursor-not-allowed"
                    : "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                {isLoggingOut ? "Logging out..." : "Logout"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Profile Modal */}
      {showProfile && (
        <ProfileComponent
          userId={userId}
          isOpen={showProfile}
          onClose={() => setShowProfile(false)}
        />
      )}
    </>
  );
}
