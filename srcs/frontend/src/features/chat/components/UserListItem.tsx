import { getUserColorCSS } from "@utils/users"

export const UserOnlineStatusIndicatorDot: React.FC<{ isOnline: boolean }> = ({ isOnline }) => {
  return (
    <div className={`w-3 h-3 rounded-full ring-2 ring-offset-1 ring-offset-transparent transition-colors ${
      isOnline ? 'bg-green-500 ring-green-500/20' : 'bg-gray-400 ring-gray-400/20'
    }`} />
  )
}

export const UserListItem: React.FC<{
  userId: number;
  username: string;
  isOnline: boolean;
  isFriend: boolean;
  onClick: (userId: number) => void;
}> = ({ userId, username, isOnline, isFriend, onClick }) => {
  const userColor = getUserColorCSS(userId, true)

  return (
    <div
      key={userId}
      onClick={() => onClick(userId)}
      className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-md transition-all group ${
        isFriend 
          ? 'bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 ring-1 ring-blue-500/30 shadow-sm' 
          : 'hover:bg-gray-200 dark:hover:bg-gray-700/60'
      }`}
    >
      <UserOnlineStatusIndicatorDot isOnline={isOnline} />
      <span
        className="text-xs font-medium truncate group-hover:opacity-100 opacity-90 transition-opacity"
        style={{ color: userColor }}
      >
        {username}
      </span>

      {isFriend && (
        <svg className="w-3 h-3 ml-auto text-blue-500/70" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      )}
    </div>
  )
}
