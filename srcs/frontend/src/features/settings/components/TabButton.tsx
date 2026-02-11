import React from 'react';

interface TabButtonProps {
	label: string;
	icon: React.ReactNode;
	active: boolean;
	onClick: () => void;
}

export const TabButton: React.FC<TabButtonProps> = ({ label, icon, active, onClick }) => {
	return (
		<button
			onClick={onClick}
			className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors rounded-lg ${
				active 
				? "bg-blue-600 text-white shadow-md" 
				: "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"
			}`}
		>
			{icon}
			<span>{label}</span>
		</button>
	)
}
