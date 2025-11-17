import React, { useState, useEffect } from "react";
import { TwoFactorSetup, TwoFactorDisable } from "./twoFactorComponent";

interface TwoFactorSettingsProps {
  userId: number;
  username: string;
  initialEnabled?: boolean;
}

export function TwoFactorSettings({ userId, username, initialEnabled }: TwoFactorSettingsProps) {
  const [is2FAEnabled, setIs2FAEnabled] = useState<boolean | null>(initialEnabled ?? null);
  const [isLoading, setIsLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [showDisable, setShowDisable] = useState(false);

  useEffect(() => {
    checkTwoFactorStatus();
  }, [userId]);

  const checkTwoFactorStatus = async () => {
    try {
      // Try to get from localStorage user data first
      const storedUser = localStorage.getItem('userData');
      if (storedUser) {
        const userData = JSON.parse(storedUser);
        if (userData?.has2FA !== undefined) {
          setIs2FAEnabled(userData.has2FA);
          setIsLoading(false);
          return;
        }
      }

      // Fallback: make API call (this endpoint needs to be added or use internal data)
      const response = await fetch(`/public_api/auth/2fa/status/${userId}`);
      if (response.ok) {
        const data = await response.json();
        setIs2FAEnabled(data.enabled);
      } else {
        // If endpoint doesn't exist, use initialEnabled prop
        setIs2FAEnabled(initialEnabled ?? false);
      }
    } catch (error) {
      console.error("Failed to check 2FA status:", error);
      // Fallback to initialEnabled prop
      setIs2FAEnabled(initialEnabled ?? false);
    } finally {
      setIsLoading(false);
    }
  };

  const updateLocalStorageUserData = (has2FA: boolean) => {
    try {
      const storedUser = localStorage.getItem('userData');
      if (storedUser) {
        const userData = JSON.parse(storedUser);
        userData.has2FA = has2FA;
        localStorage.setItem('userData', JSON.stringify(userData));
      }
    } catch (error) {
      console.error("Failed to update localStorage:", error);
    }
  };

  const handleSetupComplete = () => {
    setShowSetup(false);
    setIs2FAEnabled(true);
    updateLocalStorageUserData(true);
  };

  const handleDisableComplete = () => {
    setShowDisable(false);
    setIs2FAEnabled(false);
    updateLocalStorageUserData(false);
  };

  if (isLoading) {
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-2"></div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  if (showSetup) {
    return (
      <TwoFactorSetup
        userId={userId}
        username={username}
        onSetupComplete={handleSetupComplete}
        onCancel={() => setShowSetup(false)}
      />
    );
  }

  if (showDisable) {
    return (
      <TwoFactorDisable
        userId={userId}
        onDisableComplete={handleDisableComplete}
        onCancel={() => setShowDisable(false)}
      />
    );
  }

  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
            Two-Factor Authentication
          </h4>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            {is2FAEnabled
              ? "Your account is protected with 2FA"
              : "Add an extra layer of security to your account"}
          </p>
        </div>
        <div className="flex items-center">
          {is2FAEnabled ? (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
              <svg
                className="w-4 h-4 mr-1"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              Enabled
            </span>
          ) : (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-300">
              Disabled
            </span>
          )}
        </div>
      </div>

      <div className="mt-3">
        {is2FAEnabled ? (
          <button
            onClick={() => setShowDisable(true)}
            className="text-sm px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
          >
            Disable 2FA
          </button>
        ) : (
          <button
            onClick={() => setShowSetup(true)}
            className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
          >
            Enable 2FA
          </button>
        )}
      </div>
    </div>
  );
}
