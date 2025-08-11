#include "ChatRoom.hpp"

int main(int argc, char* argv[]) {
    if (argc != 2) {
        std::cout << "Two args !\n" ;
        return (1);
    }
    std::string uri = argv[1];
    ChatRoom room = ChatRoom(uri);
    try
    {
        room.connect();
    }
    catch(const std::exception& e)
    {
        std::cerr << e.what() << '\n';
    }
        return (0);
}
