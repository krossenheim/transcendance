import NotificationArea from "@features/global/widgets/notificationArea";
import LanguageSwitcher from "@src/components/LanguageSwitcher";
import UserMenu from "@features/global/widgets/userMenu";

interface TopHeaderBarProps {
  onLogout: () => void;
  isLoggingOut: boolean;
}

export default function TopHeaderBar({ onLogout, isLoggingOut }: TopHeaderBarProps) {
	return (
		<header className="flex-none bg-slate-800/90 border-b border-slate-700 shadow-md z-20">
			<div className="max-w-7xl mx-auto px-4 h-14 md:h-16 flex items-center justify-between">
				<div className="flex items-center gap-4 md:gap-8">
					<h1 className="text-lg md:text-xl font-bold tracking-tight text-white">TRANSCENDENCE</h1>
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