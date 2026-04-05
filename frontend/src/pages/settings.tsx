"use client"

import { UpdateProfileComponent } from "@src/features/settings/containers/updateProfile"
import { useAccessibilityStore } from "@src/stores/accessibilityStore"
import { useGlobalStore } from "@features/global/store/globalStore"
import { SideBar } from "@src/features/settings/containers/sidebar"
import { useToastStore } from "@features/toast/toastStore"
import { TwoFactorSettings } from "@src/twoFactorSettings"
import { useState } from "react"

enum SettingsTab {
  Profile = 'profile',
  Security = 'security',
  Appearance = 'appearance'
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>(SettingsTab.Profile)
  const showToast = useToastStore(s => s.showToast)

  const {
    highContrast, largeText, reducedMotion, screenReaderMode, toggle
  } = useAccessibilityStore()

  const currentUserId = useGlobalStore(state => state.me.data.currentUserId)
  const userData = useGlobalStore(state => state.me.data.currentUserData)

  return (
    <div className="flex flex-col md:flex-row h-full">
      <SideBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {}
      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        {activeTab === 'profile' && (
          <UpdateProfileComponent />
        )}

        {activeTab === 'security' && (
          <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
            <h1 className="text-2xl font-bold text-white mb-6">Security</h1>

            <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700">
               {currentUserId && userData ? (
                  <TwoFactorSettings
                    userId={currentUserId}
                    username={userData.username}
                    isGuest={userData.isGuest}
                  />
               ) : (
                 <p>Loading user data...</p>
               )}
            </div>
          </div>
        )}

        {activeTab === 'appearance' && (
          <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
            <h1 className="text-2xl font-bold text-white mb-6">Accessibility & Appearance</h1>

            <div className="space-y-4">
              <ToggleOption
                label="High Contrast"
                desc="Increases contrast of borders and backgrounds for better visibility."
                checked={highContrast}
                onChange={() => toggle('highContrast')}
              />
              <ToggleOption
                label="Large Text"
                desc="Increases the base font size of the application."
                checked={largeText}
                onChange={() => toggle('largeText')}
              />
              <ToggleOption
                label="Reduced Motion"
                desc="Disables most animations and transitions."
                checked={reducedMotion}
                onChange={() => toggle('reducedMotion')}
              />
              <ToggleOption
                label="Screen Reader Optimizations"
                desc="Adds extra aria-labels and structure for screen readers."
                checked={screenReaderMode}
                onChange={() => toggle('screenReaderMode')}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ToggleOption({ label, desc, checked, onChange }: { label: string, desc: string, checked: boolean, onChange: () => void }) {
  return (
    <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-slate-700 hover:border-blue-500/50 transition-colors">
      <div className="flex-1 pr-4">
        <h3 className="font-semibold text-white">{label}</h3>
        <p className="text-sm text-gray-400 mt-1">{desc}</p>
      </div>
      <button
        onClick={onChange}
        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          checked ? 'bg-blue-600' : 'bg-slate-600'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

