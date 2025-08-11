#ifndef CHATROOM_H
# define CHATROOM_H
# include <iostream>

class InvalidIP : public std::exception
{
    const char *what() const noexcept override;
};

class BadDisconnect : public std::exception
{
    const char *what() const noexcept override;
};

class ChatRoom
{
    public:
        ChatRoom();
        ChatRoom(const ChatRoom& other);
        ChatRoom(const std::string& remote_ip);
        ChatRoom& operator=(const ChatRoom& other);
        ~ChatRoom();
        bool connect();
        void disconnect();
    private:
        bool _networking_established;
        std::string _websocket_target;
        
};
#endif

