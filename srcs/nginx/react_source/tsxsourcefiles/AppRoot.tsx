import React, { useState } from "react";
import SocketComponent from "./socketComponent";
import LoginComponent from "./loginComponent";
import PongComponent from "./pongComponent";
import ChatInputComponent from "./chatInputComponent";
import RegisterComponent from "./registerComponent";
import { AuthResponseType } from "../../../nodejs_base_image/utils/api/service/auth/loginResponse";

export default function AppRoot() {
  const [authResponse, setAuthResponse] = useState<AuthResponseType | null>(null);

  function logInOrRegistered(varTypeAuthResponse: AuthResponseType) {
    setAuthResponse(varTypeAuthResponse);
  }

  if (authResponse) {
    return (
      <SocketComponent AuthResponseObject={authResponse}>
        <>
          <ChatInputComponent />
          <PongComponent />
        </>
      </SocketComponent>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="w-full max-w-6xl px-6 py-12 flex flex-col items-center space-y-12">
        {/* Title Section */}
        <div className="text-center text-white space-y-3">
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight drop-shadow-lg">
            Transcendence
          </h1>
          <p className="text-lg md:text-xl text-gray-300">
            Classic Pong. Modern Multiplayer.
          </p>
          <p className="text-sm md:text-base text-gray-400">
            Challenge players worldwide • Real-time chat • Compete for glory
          </p>
        </div>

        {/* Login / Register Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
          <div className="flex justify-center">
            <div className="w-full max-w-md">
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20">
                <LoginComponent onLoginSuccess={logInOrRegistered} />
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <div className="w-full max-w-md">
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20">
                <RegisterComponent whenCompletedSuccesfully={logInOrRegistered} />
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center text-gray-300 mt-12">
          <div className="bg-white/5 rounded-xl p-6 backdrop-blur-md border border-white/10 hover:border-purple-400/50 transition">
            <div className="text-4xl mb-3">🎮</div>
            <h3 className="text-white font-semibold mb-2">Multiplayer Pong</h3>
            <p className="text-sm text-gray-400">Real-time competitive gameplay</p>
          </div>
          <div className="bg-white/5 rounded-xl p-6 backdrop-blur-md border border-white/10 hover:border-purple-400/50 transition">
            <div className="text-4xl mb-3">💬</div>
            <h3 className="text-white font-semibold mb-2">Chat Rooms</h3>
            <p className="text-sm text-gray-400">Connect with other players</p>
          </div>
          <div className="bg-white/5 rounded-xl p-6 backdrop-blur-md border border-white/10 hover:border-purple-400/50 transition">
            <div className="text-4xl mb-3">🏆</div>
            <h3 className="text-white font-semibold mb-2">Leaderboards</h3>
            <p className="text-sm text-gray-400">Climb the ranks and compete</p>
          </div>
        </div>
      </div>
    </main>
  );
}
