import type {
  TypeStoredMessageSchema,
  TypeListRoomsSchema,
  TypeRoomMessagesSchema,
  TypeRoomSchema,
} from "../../../nodejs_base_image/utils/api/service/chat/db_models";
import type { idValue } from "../../../nodejs_base_image/utils/api/service/common/zodRules";
import type { room_id_rule } from "../../../nodejs_base_image/utils/api/service/chat/chat_interfaces";
import React, { Key, useCallback, useEffect, useState } from "react";
import { useWebSocket } from "./socketComponent";

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
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      onLoginSuccess(data);
    } catch (err: any) {
      // !!
      setError(err.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <div className="w-full max-w-md shadow-lg p-6 rounded-2xl bg-white">
        <h1 className="text-2xl font-bold text-center mb-4">Login</h1>

        {error && <div className="mb-4 text-red-500 text-center">{error}</div>}

        <div className="space-y-4">
          {/* Username */}
          <div>
            <label
              htmlFor="login-username"
              className="block mb-1 font-semibold"
            >
              Username
            </label>
            <input
              id="login-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => handleKeyPress(e, handleLogin)}
              className="w-full border px-3 py-2 rounded"
              disabled={isLoading}
              placeholder="Your username"
            />
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="login-password"
              className="block mb-1 font-semibold"
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => handleKeyPress(e, handleLogin)}
              className="w-full border px-3 py-2 rounded"
              disabled={isLoading}
              placeholder="Your password"
            />
          </div>

          {/* Submit Button */}
          <button
            onClick={handleLogin}
            className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600"
            disabled={isLoading}
          >
            {isLoading ? "Logging in..." : "Login"}
          </button>
        </div>
      </div>
    </div>
  );
}
