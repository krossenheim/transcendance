import React, { Key, useCallback, useEffect, useId, useState } from "react";
import { useWebSocket } from "./socketComponent";
import { TwoFactorVerify } from "./twoFactorComponent";

const handleKeyPress = (e: any, action: any) => {
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
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState<string | null>(null);

  const validateUsername = (value: string) => {
    if (!value) return "Username is required";
    if (value.length < 3) return "Username must be at least 3 characters";
    return null;
  };

  const validatePassword = (value: string) => {
    if (!value) return "Password is required";
    if (value.length < 6) return "Password must be at least 6 characters";
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
    const response = await fetch("/public_api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Login failed");
    }

    const data = await response.json();
    console.log("[v0] Login response:", data);

    // Check if 2FA is required
    if (data?.requires2FA && data?.tempToken) {
      setRequires2FA(true);
      setTempToken(data.tempToken);
      return;
    }

    // ✅ Save the JWT and refresh tokens in localStorage
    if (data?.tokens?.jwt) {
      localStorage.setItem("jwt", data.tokens.jwt);
      console.log("[v0] Stored JWT token:", data.tokens.jwt);
    } else {
      console.warn("[v0] No JWT token found in login response");
    }

    if (data?.tokens?.refresh) {
      localStorage.setItem("refreshToken", data.tokens.refresh);
    }

    // Continue app flow
    onLoginSuccess(data);
  } catch (err: any) {
    setError(err.message || "Login failed");
  } finally {
    setIsLoading(false);
  }
};

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
    <div className="flex items-start justify-center bg-gradient-to-br from-blue-50 dark:from-gray-900 via-white dark:via-gray-800 to-purple-50 dark:to-gray-900 px-4 py-4">
      <div className="w-full max-w-md shadow-lg p-4 md:p-6 mt-4 md:mt-6 rounded-2xl bg-white dark:bg-gray-800">
          <h1 className="text-2xl font-bold text-center mb-4 text-gray-900 dark:text-white">Login</h1>

        {error && <div className="mb-4 text-red-500 text-center">{error}</div>}

        <div className="space-y-4">
          {/* Username */}
          <div>
            <label
              htmlFor={`${id}-login-username`}
                className="block mb-1 font-semibold text-gray-700 dark:text-gray-200"
            >
              Username
            </label>
            <input
              id={`${id}-login-username`}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => handleKeyPress(e, handleLogin)}
                className="w-full border px-3 py-2 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400"
              disabled={isLoading}
              placeholder="Your username"
            />
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor={`${id}-login-password`}
                className="block mb-1 font-semibold text-gray-700 dark:text-gray-200"
            >
              Password
            </label>
            <input
              id={`${id}-login-password`}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => handleKeyPress(e, handleLogin)}
                className="w-full border px-3 py-2 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400"
              disabled={isLoading}
              placeholder="Your password"
            />
          </div>

          {/* Submit Button */}
          <button
            onClick={handleLogin}
              className="w-full bg-blue-500 dark:bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
            disabled={isLoading}
          >
            {isLoading ? "Logging in..." : "Login"}
          </button>
        </div>
      </div>
    </div>
  );
}
