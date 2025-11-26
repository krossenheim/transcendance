"use client"

import React from "react"

interface AccessibilitySettingsProps {
  isOpen: boolean
  onClose: () => void
  settings: {
    highContrast: boolean
    largeText: boolean
    reducedMotion: boolean
    screenReaderMode: boolean
  }
  onUpdateSettings: (settings: any) => void
}

export default function AccessibilitySettings({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}: AccessibilitySettingsProps) {
  if (!isOpen) return null

  const toggleSetting = (key: keyof typeof settings) => {
    onUpdateSettings({
      ...settings,
      [key]: !settings[key],
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      role="dialog"
      aria-labelledby="accessibility-title"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="bg-white/50 dark:bg-gray-800/95 shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col border-2 border-gray-300 dark:border-gray-600" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-blue-500/90">
          <div className="flex justify-between items-center">
            <h2 id="accessibility-title" className="text-2xl font-bold text-white">
              ♿ Accessibility Settings
            </h2>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors text-2xl"
              aria-label="Close accessibility settings"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Customize the interface to meet your accessibility needs
          </p>

          {/* High Contrast Mode */}
          <div className="flex items-center justify-between p-4 bg-gray-50/40 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700">
            <div className="flex-1">
              <label htmlFor="high-contrast" className="font-semibold text-gray-800 dark:text-gray-200 cursor-pointer">
                High Contrast Mode
              </label>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Increases contrast for better visibility
              </p>
            </div>
            <button
              id="high-contrast"
              onClick={() => toggleSetting("highContrast")}
              className={`relative w-14 h-7 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                settings.highContrast ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600/70"
              }`}
              role="switch"
              aria-checked={settings.highContrast}
              aria-label="Toggle high contrast mode"
            >
              <span
                className={`absolute top-1 left-1 w-5 h-5 bg-white transition-transform ${
                  settings.highContrast ? "translate-x-7" : ""
                }`}
              />
            </button>
          </div>

          {/* Large Text */}
          <div className="flex items-center justify-between p-4 bg-gray-50/40 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700">
            <div className="flex-1">
              <label htmlFor="large-text" className="font-semibold text-gray-800 dark:text-gray-200 cursor-pointer">
                Large Text
              </label>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Increases font size across the app
              </p>
            </div>
            <button
              id="large-text"
              onClick={() => toggleSetting("largeText")}
              className={`relative w-14 h-7 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                settings.largeText ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600/70"
              }`}
              role="switch"
              aria-checked={settings.largeText}
              aria-label="Toggle large text"
            >
              <span
                className={`absolute top-1 left-1 w-5 h-5 bg-white transition-transform ${
                  settings.largeText ? "translate-x-7" : ""
                }`}
              />
            </button>
          </div>

          {/* Reduced Motion */}
          <div className="flex items-center justify-between p-4 bg-gray-50/40 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700">
            <div className="flex-1">
              <label htmlFor="reduced-motion" className="font-semibold text-gray-800 dark:text-gray-200 cursor-pointer">
                Reduced Motion
              </label>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Minimizes animations and transitions
              </p>
            </div>
            <button
              id="reduced-motion"
              onClick={() => toggleSetting("reducedMotion")}
              className={`relative w-14 h-7 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                settings.reducedMotion ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600/70"
              }`}
              role="switch"
              aria-checked={settings.reducedMotion}
              aria-label="Toggle reduced motion"
            >
              <span
                className={`absolute top-1 left-1 w-5 h-5 bg-white transition-transform ${
                  settings.reducedMotion ? "translate-x-7" : ""
                }`}
              />
            </button>
          </div>

          {/* Screen Reader Optimizations */}
          <div className="flex items-center justify-between p-4 bg-gray-50/40 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700">
            <div className="flex-1">
              <label htmlFor="screen-reader" className="font-semibold text-gray-800 dark:text-gray-200 cursor-pointer">
                Screen Reader Mode
              </label>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Optimizes interface for screen readers
              </p>
            </div>
            <button
              id="screen-reader"
              onClick={() => toggleSetting("screenReaderMode")}
              className={`relative w-14 h-7 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                settings.screenReaderMode ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600/70"
              }`}
              role="switch"
              aria-checked={settings.screenReaderMode}
              aria-label="Toggle screen reader mode"
            >
              <span
                className={`absolute top-1 left-1 w-5 h-5 bg-white transition-transform ${
                  settings.screenReaderMode ? "translate-x-7" : ""
                }`}
              />
            </button>
          </div>

          {/* Keyboard Shortcuts Info */}
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700">
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">
              ⌨️ Keyboard Shortcuts
            </h3>
            <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
              <li><kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700/50 text-xs">Tab</kbd> - Navigate between elements</li>
              <li><kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700/50 text-xs">Enter</kbd> - Activate buttons/links</li>
              <li><kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700/50 text-xs">Esc</kbd> - Close modals/dialogs</li>
              <li><kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700/50 text-xs">Ctrl + /</kbd> - Show command help</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50/40 dark:bg-gray-900/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-500 text-white hover:bg-blue-600 transition-colors font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
