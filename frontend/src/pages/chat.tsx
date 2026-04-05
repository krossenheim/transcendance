import RoomList from "@features/chat/containers/RoomList";
import ChatBox from "@features/chat/containers/ChatBox";
import BannerAd from "@src/components/BannerAd";

import { user_url } from "@app/shared/api/service/common/endpoints";
import { getSocketSenderRef } from "@utils/socketRef";
import React from "react";

export default function ChatPage() {
  React.useEffect(() => {
    getSocketSenderRef()(user_url.ws.chat.listRooms, {});
    getSocketSenderRef()(user_url.ws.users.fetchUserConnections, null);
  }, [getSocketSenderRef]);

	return (
    <div className="min-h-screen flex items-start md:items-center justify-center p-2 md:p-4 pt-4 md:pt-4">
      <div className="w-full max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          <div className="md:col-span-1">
            <RoomList />
          </div>

          <div className="md:col-span-2">
            <ChatBox />
          </div>
        </div>
        <BannerAd />
      </div>
    </div>
  )
}

