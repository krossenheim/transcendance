#include "ChatRoom.hpp"
#include <arpa/inet.h>  // For inet_pton
#include <netinet/in.h> // For sockaddr_in and sockaddr_in6

const char *InvalidIp::what() const noexcept override
{
    return ("Invalid IP passed to ChatRoom class.")
}

const char *BadDisconnect::what() const noexcept override
{
    return ("The instance is flagged as 'succesfully connected' but the ip supplied is invalid.")
}

ChatRoom::ChatRoom() : _networking_established(false), _websocket_target(std::string())
{

}

ChatRoom::ChatRoom(const ChatRoom& other) : _networking_established(false), _websocket_target(other._websocket_target)
{

}

ChatRoom& operator=(const ChatRoom& other)
{
    if (this != &other)
        *this = ChatRoom(other);
    return (*this);
}

ChatRoom::~ChatRoom()
{
    if (_networking_established)
        std::cout << "Destructor must close connection cleanly." << std::endl;
}

static bool is_valid_ip(const std::string& remote_ip)
{
    sockaddr_in sa4;
    sockaddr_in6 sa6;

    if (inet_pton(AF_INET, remote_ip.c_str(), &(sa4.sin_addr)) == 1)
        return true;

    if (inet_pton(AF_INET6, remote_ip.c_str(), &(sa6.sin6_addr)) == 1)
        return true;

    return false;
}

ChatRoom::ChatRoom(const std::string& remote_ip) : _networking_established(false)
{
    if (!is_valid_ip(remote_ip))
        throw InvalidIp();
    _websocket_target = remote_ip;
}

bool ChatRoom::connect()
{
    return (true);
}

void ChatRoom::disconnect()
{
    if (!_networking_established)
        return ;
    if (!is_valid_ip(_websocket_target))
        throw BadDisconnect();
    
}