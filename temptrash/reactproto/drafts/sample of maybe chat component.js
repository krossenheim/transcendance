const StoredMessageSchema = z
  .object({
    messageId: z.string(), // replace idValue
    roomId: z.string(), // replace room_id_rule
    messageString: z.string(), // replace message_rule
    messageDate: z.string(), // replace message_date_rule
    userId: z.string(), // replace idValue
  })
  .strict();

const RoomMessagesSchema = z
  .object({
    roomId: z.string(), // replace room_id_rule
    messages: z.array(StoredMessageSchema),
  })
  .strict();

const GetUsersInRoomSchema = z
  .object({
    roomName: z.string(), // replace room_name_rule
    roomId: z.string(), // replace room_id_rule
    messages: z.array(StoredMessageSchema),
    users: z.array(z.string()), // idValue
  })
  .strict();

const ListRoomsSchema = z
  .array(
    z.object({
      roomId: z.string(),
      roomName: z.string(),
    }).strict()
  );

// ---------------------------
// ChatComponent with handlers
// ---------------------------
export function ChatComponent({ webSocket }) {
  const childHandlersRef = React.useRef([]);

  // ---------------------------
  // Parent message routing
  // ---------------------------
  const registerChildHandler = React.useCallback((handler) => {
    childHandlersRef.current.push(handler);
    return () => {
      childHandlersRef.current = childHandlersRef.current.filter(
        (h) => h !== handler
      );
    };
  }, []);

  React.useEffect(() => {
    if (!webSocket) return;

    const handleMessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        console.warn("Invalid JSON:", event.data);
        return;
      }

      if (!data || data.source_container !== "chat") return;

      for (const handler of childHandlersRef.current) {
        try {
          handler(data);
        } catch (err) {
          console.error("Child handler error:", err);
        }
      }
    };

    webSocket.addEventListener("message", handleMessage);
    return () => webSocket.removeEventListener("message", handleMessage);
  }, [webSocket]);

  // ---------------------------
  // Handlers for each schema
  // ---------------------------

  // 1. StoredMessageSchema
  React.useEffect(() => {
    const handler = (data) => {
      if (data.funcId === "send_message") {
        try {
          const parsed = StoredMessageSchema.parse(data.payload);
          console.log("StoredMessageSchema received:", parsed);
        } catch (err) {
          console.warn("Invalid StoredMessageSchema:", err);
        }
      }
    };
    return registerChildHandler(handler);
  }, [registerChildHandler]);

  // 2. RoomMessagesSchema
  React.useEffect(() => {
    const handler = (data) => {
      if (data.funcId === "room_messages") {
        try {
          const parsed = RoomMessagesSchema.parse(data.payload);
          console.log("RoomMessagesSchema received:", parsed);
        } catch (err) {
          console.warn("Invalid RoomMessagesSchema:", err);
        }
      }
    };
    return registerChildHandler(handler);
  }, [registerChildHandler]);

  // 3. GetUsersInRoomSchema
  React.useEffect(() => {
    const handler = (data) => {
      if (data.funcId === "get_users_in_room") {
        try {
          const parsed = GetUsersInRoomSchema.parse(data.payload);
          console.log("GetUsersInRoomSchema received:", parsed);
        } catch (err) {
          console.warn("Invalid GetUsersInRoomSchema:", err);
        }
      }
    };
    return registerChildHandler(handler);
  }, [registerChildHandler]);

  // 4. ListRoomsSchema
  React.useEffect(() => {
    const handler = (data) => {
      if (data.funcId === "list_rooms") {
        try {
          const parsed = ListRoomsSchema.parse(data.payload);
          console.log("ListRoomsSchema received:", parsed);
        } catch (err) {
          console.warn("Invalid ListRoomsSchema:", err);
        }
      }
    };
    return registerChildHandler(handler);
  }, [registerChildHandler]);

  // ---------------------------
  // Dummy UI (optional)
  // ---------------------------
  return <div className="p-4 text-gray-800">ChatComponent running…</div>;
}

window.ChatComponent = ChatComponent;
