import SocketComponent from "./socketComponent";
import LoginComponent from "./loginComponent";
import PongComponent from "./pongComponent";
import ChatInputComponent from "./chatInputComponent";
import RegisterComponent from "./registerComponent";
import React, { useState, useEffect } from "react";
import { AuthResponseType } from "../../../nodejs_base_image/utils/api/service/auth/loginResponse";

export default function AppRoot() {
  const [authResponse, setAuthResponse] = useState<AuthResponseType | null>(null);
  const [currentPage, setCurrentPage] = useState<'chat' | 'pong'>('chat');
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  const toggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    if (newDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('darkMode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('darkMode', 'false');
    }
  };

  function logInOrRegistered(varTypeAuthResponse: AuthResponseType) {
    setAuthResponse(varTypeAuthResponse);
  }

  return (
    <div 
      className={`min-h-screen bg-cover bg-center bg-fixed transition-colors duration-200`}
      style={{
        backgroundImage: darkMode 
          ? 'url(/static/react_dist/bg_dark.jpg)' 
          : 'url(/static/react_dist/bg_light.jpg)',
      }}
    >
      {/* Semi-transparent overlay for better text readability */}
      <div className="fixed inset-0 bg-black/5 dark:bg-black/20 pointer-events-none"></div>
      
      <div className="relative z-10">
        {authResponse ? (
        <SocketComponent AuthResponseObject={authResponse}>
          <div className="flex flex-col h-screen">
            {/* Header */}
            <header className="bg-white dark:bg-dark-800 shadow dark:shadow-dark-700">
              <div className="max-w-5xl mx-auto px-4 py-4">
                <div className="flex justify-between items-center">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Transcendence</h1>
                  <div className="flex items-center space-x-4">
                    <nav className="flex space-x-4">
                      <button
                        onClick={() => setCurrentPage('chat')}
                        className={`px-4 py-2 rounded-md ${
                          currentPage === 'chat'
                            ? 'bg-blue-500 text-white'
                            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700'
                        }`}
                      >
                        Chat
                      </button>
                      <button
                        onClick={() => setCurrentPage('pong')}
                        className={`px-4 py-2 rounded-md ${
                          currentPage === 'pong'
                            ? 'bg-blue-500 text-white'
                            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700'
                        }`}
                      >
                        Pong
                      </button>
                    </nav>
                    <button
                      onClick={toggleDarkMode}
                      className="p-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700"
                      title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                    >
                      {darkMode ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      ) : (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-hidden flex justify-center">
              <div className="w-full max-w-5xl px-4 py-6 flex flex-col">
                <div className="bg-white dark:bg-dark-800 rounded-lg shadow dark:shadow-dark-700 flex-1 overflow-hidden flex flex-col">
                  {currentPage === 'chat' ? (
                    <div className="p-6">
                      <ChatInputComponent />
                    </div>
                  ) : (
                    <div className="p-6 flex-1 flex overflow-hidden">
                      <PongComponent />
                    </div>
                  )}
                </div>
              </div>
            </main>
          </div>
        </SocketComponent>
      ) : (
        <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl w-full space-y-8">
            <div className="flex flex-col items-center">
              <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
                Welcome to Transcendence
              </h2>
              <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
                Please log in or create an account to continue
              </p>
              <button
                onClick={toggleDarkMode}
                className="mt-4 p-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-700"
                title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                {darkMode ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
            </div>
            
            <div className="mt-8 bg-white dark:bg-dark-800 py-8 px-4 shadow sm:rounded-lg sm:px-10 dark:shadow-dark-700">
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Log In</h3>
                  <LoginComponent onLoginSuccess={logInOrRegistered} />
                </div>
                <div className="border-l dark:border-dark-700 pl-8">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Register</h3>
                  <RegisterComponent whenCompletedSuccesfully={logInOrRegistered} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
