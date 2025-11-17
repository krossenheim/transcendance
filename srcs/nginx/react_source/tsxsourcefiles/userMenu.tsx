import React, { useState, useEffect, useRef } from "react";
import ProfileComponent from "./profileComponent";

interface UserMenuProps {
  username: string;
  userId: number;
  avatarUrl?: string;
  onLogout: () => void;
  isLoggingOut: boolean;
}

export default function UserMenu({ username, userId, avatarUrl, onLogout, isLoggingOut }: UserMenuProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
      <div className="relative" ref={dropdownRef}>
        {/* Username button with avatar */}
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition-colors"
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
          <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
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
          <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-dark-800 rounded-lg shadow-lg dark:shadow-dark-700 border border-gray-200 dark:border-dark-700 py-2 z-50">
            {/* User info header */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-700">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{username}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">User ID: {userId}</p>
            </div>

            {/* Menu items */}
            <div className="py-1">
              <button
                onClick={() => {
                  setShowProfile(true);
                  setIsDropdownOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                View my profile
              </button>

              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  // Add settings navigation here if needed
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
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
