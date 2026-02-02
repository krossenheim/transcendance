import { TypeStoredMessageSchema } from "@app/shared/api/service/chat/db_models"
import { PublicUserDataType } from "@app/shared/api/service/db/user"
import { getUserColorCSS, getVisualUserName } from "@utils/users"

interface ChatMessageProps {
  user: PublicUserDataType | undefined,
  message: TypeStoredMessageSchema,
  isSelf: boolean,
  onProfileClick: (userId: number) => void,
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ user, message, isSelf, onProfileClick }) => {
  const userColor = getUserColorCSS(message.userId, true);
  const visualUserName = getVisualUserName(user, message.userId);
  const messageDate = new Date(message.messageDate * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div key={message.messageId} className={`flex flex-col mb-3 ${isSelf ? 'items-end' : 'items-start'}`}>
      <div className={`flex items-baseline gap-2 mb-1 px-1 ${isSelf ? 'flex-row-reverse' : 'flex-row'}`}>
        <span 
          onClick={() => onProfileClick(message.userId)} 
          className="text-sm font-bold hover:underline cursor-pointer" 
          style={{ color: userColor }}
        >
          {visualUserName}
        </span>
        <span className="text-[10px] text-gray-400 select-none">
          {messageDate}
        </span>
      </div>

      <div className={`px-4 py-2 max-w-[85%] shadow-sm text-sm break-words leading-relaxed
          ${isSelf 
              ? 'bg-blue-600 text-white rounded-2xl rounded-tr-none' 
              : 'glass-light-xs dark:glass-dark-xs glass-border text-gray-900 dark:text-gray-100 rounded-2xl rounded-tl-none'
          }
      `}> 
        <p>{message.messageString}</p>
      </div>
    </div>
  )
}
