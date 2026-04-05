import NotificationArea from "@features/global/widgets/notificationArea";
import LanguageSwitcher from "@src/components/LanguageSwitcher";
import UserMenu from "@features/global/widgets/userMenu";
import { useNavigate, useLocation } from "react-router-dom";
import { useLanguage } from "@src/i18n/LanguageContext";

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
			<div className="max-w-7xl mx-auto px-4 h-14 md:h-16 flex items-center justify-between">
				<div className="flex items-center gap-4 md:gap-8">
					<h1 className="text-lg md:text-xl font-bold tracking-tight text-white">TRANSCENDENCE</h1>
					<nav className="flex items-center gap-1 md:gap-2">
						<button
							onClick={() => navigate('/chat')}
							className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
								location.pathname === '/chat'
									? 'bg-slate-600 text-white'
									: 'text-slate-300 hover:text-white hover:bg-slate-700'
							}`}
						>
							💬 {t('nav.chat')}
						</button>
						<button
							onClick={() => navigate('/pong')}
							className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
								location.pathname === '/pong'
									? 'bg-slate-600 text-white'
									: 'text-slate-300 hover:text-white hover:bg-slate-700'
							}`}
						>
							🏓 {t('nav.pong')}
						</button>
					</nav>
				</div>

				<div className="flex items-center gap-2 md:gap-4">
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

