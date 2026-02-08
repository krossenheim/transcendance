"use client"

import { useState, useRef, useEffect } from "react"
import { useGlobalStore } from "@features/global/store/globalStore"
import { useWebSocket, HandlerResult } from "@src/socketComponent"
import { user_url } from "@app/shared/api/service/common/endpoints"
import { useLanguage } from "@src/i18n"
import { useAccessibilityStore } from "@src/stores/accessibilityStore"
import { useToastStore } from "@features/toast/toastStore"
import { TwoFactorSettings } from "@src/twoFactorSettings"
import { getPlayerInitials } from "@utils/users"
import GDPRPage from "@src/GDPRPage"

export default function SettingsPage() {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'privacy' | 'appearance'>('profile')
  const showToast = useToastStore(s => s.showToast)
  
  // Stores
  const { isConnected, sendMessage, subscribe } = useWebSocket()
  const { 
    highContrast, largeText, reducedMotion, screenReaderMode, toggle 
  } = useAccessibilityStore()
  
  // User Data
  const currentUserId = useGlobalStore(state => state.me.data.currentUserId)
  const userData = useGlobalStore(state => state.me.data.currentUserData)

  // Form State
  const [alias, setAlias] = useState("")
  const [email, setEmail] = useState("")
  const [bio, setBio] = useState("")
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Initialize form with current data
  useEffect(() => {
    if (userData) {
      setAlias(userData.alias || "")
      setEmail(userData.email || "")
      setBio(userData.bio || "")
    }
  }, [userData])

  // Get Avatar URL
  useEffect(() => {
    if (!userData?.avatarUrl) return;
    useGlobalStore.getState().users.actions.fetchUserProfileUrl(userData.avatarUrl).then(result => {
      if (result.isOk()) {
        setPreviewAvatar(result.unwrap());
      }
    });
  }, [userData?.avatarUrl]);

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        showToast("File size must be less than 5MB", "error")
        return
      }
      setAvatarFile(file)
      setPreviewAvatar(URL.createObjectURL(file))
    }
  }

  const updateProfileData = useGlobalStore(state => state.me.actions.updateProfileData)

  const handleSaveProfile = async () => {
    if (!currentUserId) return
    setIsSaving(true)

	await updateProfileData({
	  alias: alias,
	  email: email,
	  bio: bio,
	}, avatarFile)
  }

  const TabButton = ({ id, label, icon }: { id: typeof activeTab, label: string, icon: React.ReactNode }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors rounded-lg ${
        activeTab === id 
          ? "bg-blue-600 text-white shadow-md" 
          : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )

  return (
    <div className="flex flex-col md:flex-row h-full">
      {/* Sidebar */}
      <div className="w-full md:w-64 bg-gray-50/50 dark:bg-slate-800/50 border-r border-gray-200 dark:border-slate-700 p-4 space-y-2">
        <h2 className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 mt-2">Settings</h2>
        
        <TabButton 
          id="profile" 
          label={t('profile.editProfile') || "Edit Profile"}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
        />
        <TabButton 
          id="security" 
          label={t('profile.securitySettings') || "Security"}
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
        />
        <TabButton 
          id="privacy" 
          label="Data & Privacy"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
        />
        <TabButton 
          id="appearance" 
          label="Appearance"
          icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
        />
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        {activeTab === 'profile' && (
          <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Profile Settings</h1>
            
            {/* Avatar */}
            <div className="flex items-center gap-6 p-4 bg-white/5 dark:bg-slate-900/50 rounded-xl border border-gray-200 dark:border-slate-700">
              <div className="relative h-24 w-24 rounded-full overflow-hidden bg-gray-200 dark:bg-slate-700 ring-4 ring-white dark:ring-slate-800 shadow-lg">
                {previewAvatar ? (
                  <img src={previewAvatar} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-3xl font-bold text-gray-500">
                    {getPlayerInitials(userData || undefined, currentUserId || -1)}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                  <span className="text-white text-xs font-medium">Change</span>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Profile Picture</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">JPG or PNG. Max 5MB.</p>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarSelect} />
                <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 text-sm bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-md hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors">
                  Upload New
                </button>
              </div>
            </div>

            {/* Fields */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Alias</label>
                <input 
                  type="text" 
                  value={alias} 
                  onChange={(e) => setAlias(e.target.value)}
                  className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-shadow"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
                <input 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-shadow"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bio</label>
                <textarea 
                  value={bio} 
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-shadow resize-none"
                />
                <p className="text-xs text-gray-500 mt-1 text-right">{bio.length}/500</p>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-slate-700 flex justify-end">
              <button 
                onClick={handleSaveProfile}
                disabled={isSaving}
                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-500/30 disabled:opacity-70 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-900/20"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Security</h1>
            
            <div className="bg-white/5 dark:bg-slate-900/50 p-6 rounded-xl border border-gray-200 dark:border-slate-700">
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

        {activeTab === 'privacy' && (
           <div className="animate-fadeIn">
              <GDPRPage showToast={showToast} embedded={true} />
           </div>
        )}

        {activeTab === 'appearance' && (
          <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Accessibility & Appearance</h1>
            
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
    <div className="flex items-center justify-between p-4 bg-white/5 dark:bg-slate-900/50 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-blue-500/50 transition-colors">
      <div className="flex-1 pr-4">
        <h3 className="font-semibold text-gray-900 dark:text-white">{label}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{desc}</p>
      </div>
      <button
        onClick={onChange}
        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          checked ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-600'
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