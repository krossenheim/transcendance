#ifndef CHATROOM_H
# define CHATROOM_H
#include <websocketpp/config/asio_client.hpp>
#include <websocketpp/client.hpp>
# include <iostream>

class InvalidIP : public std::exception
{
    const char *what() const noexcept override;
};

class BadDisconnect : public std::exception
{
    const char *what() const noexcept override;
};

typedef websocketpp::client<websocketpp::config::asio_tls_client> client;

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
        void on_message(websocketpp::connection_hdl hdl, message_ptr msg);
        void on_open(websocketpp::connection_hdl hdl);
        
    private:
        bool _networking_established;
        std::string _remote_uri;
        client _client;
};
#endif

