#ifndef CHATROOM_H
# define CHATROOM_H
# include <websocketpp/client.hpp>
# include <websocketpp/config/asio_no_tls_client.hpp>
# include <iostream>

class InvalidIP : public std::exception
{
    const char *what() const noexcept override;
};

class BadDisconnect : public std::exception
{
    const char *what() const noexcept override;
};

typedef websocketpp::client<websocketpp::config::asio_client> client;

using websocketpp::lib::placeholders::_1;
using websocketpp::lib::placeholders::_2;
using websocketpp::lib::bind;

// pull out the type of messages sent by our config
typedef websocketpp::config::asio_client::message_type::ptr message_ptr;

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
        void on_message(client* _client, websocketpp::connection_hdl hdl, message_ptr msg);
    private:
        bool _networking_established;
        std::string _remote_uri;
        client _client;
};
#endif

