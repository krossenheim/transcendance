import { TabButton } from "@features/settings/components/TabButton";
import { useLanguage } from "@language/LanguageContext";

enum SettingsTab {
	Profile = 'profile',
	Security = 'security',
	Appearance = 'appearance'
}

interface SidebarProps {
	activeTab: SettingsTab;
	setActiveTab: (tab: SettingsTab) => void;
}

export const SideBar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
	const { t } = useLanguage();

	return (
		<div className="w-full md:w-64 bg-gray-50/50 dark:bg-slate-800/50 border-r border-gray-200 dark:border-slate-700 p-4 space-y-2">
			<h2 className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 mt-2">Settings</h2>

			<TabButton 
				label={t('profile.editProfile') || "Edit Profile"}
				icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
				active={activeTab === SettingsTab.Profile}
				onClick={() => setActiveTab(SettingsTab.Profile)}
			/>
			<TabButton 
				label={t('profile.securitySettings') || "Security"}
				icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
				active={activeTab === SettingsTab.Security}
				onClick={() => setActiveTab(SettingsTab.Security)}
			/>
			<TabButton 
				label="Appearance"
				icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
				active={activeTab === SettingsTab.Appearance}
				onClick={() => setActiveTab(SettingsTab.Appearance)}
			/>
		</div>
	)
}
