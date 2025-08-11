#include "ChatRoom.hpp"

const char *InvalidIP::what() const noexcept
{
    return ("Invalid IP passed to ChatRoom class.");
}

const char *BadDisconnect::what() const noexcept
{
    return ("The instance is flagged as 'succesfully connected' but the ip supplied is invalid.");
}

ChatRoom::ChatRoom() : _networking_established(false), _remote_uri(std::string())
{

}

ChatRoom::ChatRoom(const ChatRoom& other) : _networking_established(false), _remote_uri(other._remote_uri)
{

}

ChatRoom& ChatRoom::operator=(const ChatRoom& other)
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

ChatRoom::ChatRoom(const std::string& remote_ip) : _networking_established(false)
{
    _remote_uri = remote_ip;
}
