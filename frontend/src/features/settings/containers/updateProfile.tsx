import { useGlobalStore } from '@src/features/global/store/globalStore';
import { getPlayerInitials } from '@src/utils/users';
import { toast } from '@src/features/toast/toastStore';
import React, { useEffect, useRef } from 'react';

interface UpdateProfileProps {

}

export const UpdateProfileComponent: React.FC<UpdateProfileProps> = () => {
	const currentUserId = useGlobalStore((state) => state.me.data.currentUserId);
	const currentUserData = useGlobalStore((state) => state.me.data.currentUserData);

	const [alias, setAlias] = React.useState(currentUserData?.alias || '');
	const [bio, setBio] = React.useState(currentUserData?.bio || '');
	const [email, setEmail] = React.useState(currentUserData?.email || '');
	const [pfpFile, setPfpFile] = React.useState<File | null>(null);
	const [previewPfp, setPreviewPfp] = React.useState<string | null>(null);

	const updateProfileData = useGlobalStore((state) => state.me.actions.updateProfileData);

	const fileInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (currentUserData?.avatarUrl) {
			useGlobalStore.getState().users.actions.fetchUserProfileUrl(currentUserData.avatarUrl).then((result) => {
				if (result.isOk()) {
					setPreviewPfp(result.unwrap());
				}
			})
		}
	}, [currentUserData?.avatarUrl]);

	const handlePfpSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			if (file.size > 5 * 1024 * 1024) {
				toast.error("File size exceeds 5MB limit");
				return;
			}
			setPfpFile(file);
			setPreviewPfp(URL.createObjectURL(file));
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!currentUserId) {
			toast.error("User not logged in");
			return;
		}

		updateProfileData({ userId: currentUserId, bio, alias, email }, pfpFile);
	};

	const isSaving = false;

	return (
		<div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
			<h1 className="text-2xl font-bold text-white mb-6">Profile Settings</h1>
			
			{/* Avatar */}
			<div className="flex items-center gap-6 p-4 bg-slate-900/50 rounded-xl border border-slate-700">
				<div className="relative h-24 w-24 rounded-full overflow-hidden bg-slate-700 ring-4 ring-slate-800 shadow-lg">
					{previewPfp ? (
						<img src={previewPfp} alt="Avatar" className="h-full w-full object-cover" />
					) : (
						<div className="h-full w-full flex items-center justify-center text-3xl font-bold text-gray-500">
						{getPlayerInitials(currentUserData || undefined, currentUserId || -1)}
						</div>
					)}
					<div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
						<span className="text-white text-xs font-medium">Change</span>
					</div>
				</div>
				<div>
					<h3 className="text-lg font-medium text-white">Profile Picture</h3>
					<p className="text-sm text-gray-400 mb-3">JPG or PNG. Max 5MB.</p>
					<input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePfpSelect} />
					<button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 text-sm bg-slate-700 border border-slate-600 rounded-md hover:bg-slate-600 transition-colors">
						Upload New
					</button>
				</div>
			</div>

			{/* Fields */}
			<div className="space-y-4">
				<div>
					<label className="block text-sm font-medium text-gray-300 mb-1">Alias</label>
					<input 
						type="text" 
						value={alias} 
						onChange={(e) => setAlias(e.target.value)}
						className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-shadow"
					/>
				</div>
				
				<div>
					<label className="block text-sm font-medium text-gray-300 mb-1">Email Address</label>
					<input 
						type="email" 
						value={email} 
						onChange={(e) => setEmail(e.target.value)}
						className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-shadow"
					/>
				</div>

				<div>
					<label className="block text-sm font-medium text-gray-300 mb-1">Bio</label>
					<textarea 
						value={bio} 
						onChange={(e) => setBio(e.target.value)}
						rows={4}
						className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-shadow resize-none"
					/>
					<p className="text-xs text-gray-500 mt-1 text-right">{bio.length}/500</p>
				</div>
			</div>

			<div className="pt-4 border-t border-slate-700 flex justify-end">
				<button 
					onClick={handleSubmit}
					disabled={isSaving}
					className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-500/30 disabled:opacity-70 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-900/20"
				>
					{isSaving ? "Saving..." : "Save Changes"}
				</button>
			</div>
		</div>
	)
}
