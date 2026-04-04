import { pub_url } from "@app/shared/api/service/common/endpoints";
import { useToastStore } from "@features/toast/toastStore";
import { TwoFactorVerify } from "../../twoFactorComponent";
import React, { useId, useState } from "react";
import { apiCall } from "@utils/useApi";
import { useLanguage } from "../../i18n";

const handleKeyPress = (e: React.KeyboardEvent, action: () => void): void => {
  if (e.key === "Enter") {
    e.preventDefault();
    action();
  }
};
interface LoginComponentProps {
  onLoginSuccess: (data: any) => void;
}

export default function LoginComponent({
  onLoginSuccess,
}: LoginComponentProps) {
  const id = useId();
  const { t } = useLanguage();
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [isGuestLoading, setIsGuestLoading] = useState<boolean>(false);

  const showToast = useToastStore(state => state.showToast);

  const validateUsername = (value: string) => {
    if (!value) return t('login.usernameRequired');
    if (value.length < 3) return t('login.usernameMinLength');
    return null;
  };

  const validatePassword = (value: string) => {
    if (!value) return t('login.passwordRequired');
    if (value.length < 6) return t('login.passwordMinLength');
    return null;
  };

  const handleLogin = async () => {
    setError(null);

    const usernameError = validateUsername(username);
    const passwordError = validatePassword(password);
    if (usernameError || passwordError) {
      setError(usernameError || passwordError);
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiCall(pub_url.http.auth.loginUser, {
        body: { username, password },
      })

      if (response.code !== 200)
        throw new Error(response.payload.message || "Login failed");
  
      const data = response.payload;
      if ('requires2FA' in data) {
        setRequires2FA(data.requires2FA);
        setTempToken(data.tempToken || null);
        return;
      }

      localStorage.setItem("jwt", data.tokens.jwt);
      
      if (data.tokens.refresh !== undefined) {
        localStorage.setItem("refreshToken", data.tokens.refresh);
      }

      onLoginSuccess(data);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Login failed";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  async function handleGuestLogin() {
    setIsGuestLoading(true);
    try {
      const res = await apiCall(pub_url.http.auth.createGuestUser, {});
      if (res.code !== 201)
        throw new Error("Guest creation failed: " + (res.payload.message || "unknown"));
      onLoginSuccess(res.payload);
    } catch (err: any) {
      showToast("Guest login failed: " + (err?.message || "unknown"), 'error');
    } finally {
      setIsGuestLoading(false);
    }
  }

  const handle2FACancel = () => {
    setRequires2FA(false);
    setTempToken(null);
    setPassword("");
  };

  // Show 2FA verification if required
  if (requires2FA && tempToken) {
    return (
      <TwoFactorVerify
        tempToken={tempToken}
        onVerifySuccess={onLoginSuccess}
        onCancel={handle2FACancel}
      />
    );
  }

  return (
    <div className="flex items-start justify-center px-4 py-4">
      <div className="w-full max-w-md shadow-lg p-4 md:p-6 mt-4 md:mt-6 glass-dark-sm glass-border">
        <h1 className="text-2xl font-bold text-center mb-4 text-white">{t('login.title')}</h1>

        {error && <div className="mb-4 text-red-500 text-center">{error}</div>}

        <div className="space-y-4">
          {/* Username */}
          <div>
            <label
              htmlFor={`${id}-login-username`}
              className="block mb-1 font-semibold text-gray-200"
            >
              {t('login.username')}
            </label>
            <input
              id={`${id}-login-username`}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => handleKeyPress(e, handleLogin)}
              className="w-full border px-3 py-2 border-gray-600 bg-gray-700/50 text-gray-100 focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
              disabled={isLoading}
              placeholder={t('login.usernamePlaceholder')}
            />
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor={`${id}-login-password`}
              className="block mb-1 font-semibold text-gray-200"
            >
              {t('login.password')}
            </label>
            <input
              id={`${id}-login-password`}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => handleKeyPress(e, handleLogin)}
              className="w-full border px-3 py-2 border-gray-600 bg-gray-700/50 text-gray-100 focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
              disabled={isLoading}
              placeholder={t('login.passwordPlaceholder')}
            />
          </div>

          {/* Submit Button */}
          <button
            onClick={handleLogin}
            className="w-full bg-blue-600 text-white py-2 px-4 hover:bg-blue-700 transition-colors"
            disabled={isLoading}
          >
            {isLoading ? t('login.loggingIn') : t('login.loginButton')}
          </button>

          {/* GitHub OAuth Button */}
          <button
            onClick={() => window.location.href = '/public_api/auth/oauth/github/login'}
            className="w-full mt-4 bg-gray-700/80 text-white py-2 px-4 hover:bg-gray-600/80 transition-colors flex items-center justify-center gap-2"
            disabled={isLoading}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
            {t('login.continueWithGithub')}
          </button>

          {/* Continue as Guest Button */}
          <button
            onClick={handleGuestLogin}
            className="w-full mt-4 bg-gray-600 text-white py-2 px-4 hover:bg-gray-700 transition-colors"
            disabled={isLoading || isGuestLoading}
          >
            {isGuestLoading ? t('login.continueAsGuestLoading') : t('login.continueAsGuest')}
          </button>
        </div>
      </div>
    </div>
  );
}
