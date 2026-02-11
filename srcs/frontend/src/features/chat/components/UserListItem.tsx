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
  onClick: (userId: number) => void;
}> = ({ userId, username, isOnline, onClick }) => {
  const userColor = getUserColorCSS(userId, true)

  return (
    <div
      key={userId}
      onClick={() => onClick(userId)}
      className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-200 dark:hover:bg-gray-700/60 cursor-pointer rounded-md transition-colors group"
    >
      <UserOnlineStatusIndicatorDot isOnline={isOnline} />
      <span className="text-xs font-medium truncate group-hover:opacity-100 opacity-90 transition-opacity" style={{ color: userColor }}>
        {username}
      </span>
    </div>
  )
}
