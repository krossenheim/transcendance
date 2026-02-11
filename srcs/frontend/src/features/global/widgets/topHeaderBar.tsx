import NotificationArea from "@features/global/widgets/notificationArea";
import LanguageSwitcher from "@src/components/LanguageSwitcher";
import { useLocation, useNavigate } from "react-router-dom";
import UserMenu from "@features/global/widgets/userMenu";
import { WebPage } from "@src/pages/navigation"
import { useLanguage } from "@src/i18n";

interface TopHeaderBarProps {
  onLogout: () => void;
  isLoggingOut: boolean;
}

export default function TopHeaderBar({ onLogout, isLoggingOut }: TopHeaderBarProps) {
	const navigate = useNavigate();
	const location = useLocation();
	const { t } = useLanguage();

	return (
		<header className="flex-none bg-slate-800/90 border-b border-slate-700 shadow-md z-20">
			<div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
				<div className="flex items-center gap-8">
					<h1 className="text-xl font-bold tracking-tight text-white">TRANSCENDENCE</h1>
					<nav className="hidden md:flex items-center gap-1">
						<button 
							onClick={() => navigate(WebPage.Chat)} 
							className={`px-3 py-2 rounded-md transition-colors ${location.pathname === WebPage.Chat ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-slate-700'}`}
						>
							{t('nav.chat')}
						</button>
						<button 
							onClick={() => navigate(WebPage.Pong)} 
							className={`px-3 py-2 rounded-md transition-colors ${location.pathname === WebPage.Pong ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-slate-700'}`}
						>
							{t('nav.pong')}
						</button>
					</nav>
				</div>

				<div className="flex items-center gap-4">
					<LanguageSwitcher />
					<NotificationArea />
					<UserMenu
						onLogout={onLogout}
						isLoggingOut={isLoggingOut}
					/>
				</div>
			</div>
		</header>
	)
}