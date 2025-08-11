#ifndef CHATROOM_H
# define CHATROOM_H
# include <iostream>
# include <websocketpp/client.hpp>
# include <websocketpp/config/asio_no_tls_client.hpp>

class InvalidIP : public std::exception
{
    const char *what() const noexcept override;
};

class BadDisconnect : public std::exception
{
    const char *what() const noexcept override;
};

typedef websocketpp::client<websocketpp::config::asio_client> client;

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
        std::string _remote_uri;
        client _client;
};
#endif

