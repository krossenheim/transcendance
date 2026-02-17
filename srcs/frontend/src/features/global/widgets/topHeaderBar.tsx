import NotificationArea from "@features/global/widgets/notificationArea";
import LanguageSwitcher from "@src/components/LanguageSwitcher";
import { useLocation, useNavigate } from "react-router-dom";
import UserMenu from "@features/global/widgets/userMenu";
import { WebPage } from "@src/pages/navigation"
import { useLanguage } from "@src/i18n";
import { useState } from "react";

interface TopHeaderBarProps {
  onLogout: () => void;
  isLoggingOut: boolean;
}

export default function TopHeaderBar({ onLogout, isLoggingOut }: TopHeaderBarProps) {
	const navigate = useNavigate();
	const location = useLocation();
	const { t } = useLanguage();
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

	return (
		<header className="flex-none bg-slate-800/90 border-b border-slate-700 shadow-md z-20">
			<div className="max-w-7xl mx-auto px-4 h-14 md:h-16 flex items-center justify-between">
				<div className="flex items-center gap-4 md:gap-8">
					{/* Mobile menu button */}
					<button 
						onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
						className="md:hidden p-2 -ml-2 text-gray-300 hover:bg-slate-700 rounded-md"
						aria-label="Toggle menu"
					>
						<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							{mobileMenuOpen ? (
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
							) : (
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
							)}
						</svg>
					</button>
					<h1 className="text-lg md:text-xl font-bold tracking-tight text-white">TRANSCENDENCE</h1>
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

				<div className="flex items-center gap-2 md:gap-4">
					<LanguageSwitcher />
					<NotificationArea />
					<UserMenu
						onLogout={onLogout}
						isLoggingOut={isLoggingOut}
					/>
				</div>
			</div>

			{/* Mobile navigation menu */}
			{mobileMenuOpen && (
				<div className="md:hidden border-t border-slate-700 bg-slate-800/95">
					<nav className="flex flex-col p-2 space-y-1">
						<button 
							onClick={() => {
								navigate(WebPage.Chat);
								setMobileMenuOpen(false);
							}} 
							className={`w-full text-left px-4 py-3 rounded-md transition-colors ${location.pathname === WebPage.Chat ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-slate-700'}`}
						>
							{t('nav.chat')}
						</button>
						<button 
							onClick={() => {
								navigate(WebPage.Pong);
								setMobileMenuOpen(false);
							}} 
							className={`w-full text-left px-4 py-3 rounded-md transition-colors ${location.pathname === WebPage.Pong ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-slate-700'}`}
						>
							{t('nav.pong')}
						</button>
					</nav>
				</div>
			)}
		</header>
	)
}