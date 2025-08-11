#include "ChatRoom.hpp"

/*
 * Copyright (_client) 2016, Peter Thorson. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of the WebSocket++ Project nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL PETER THORSON BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 */

static const std::string empty_str = "";

const std::string send_to_room(const std::string& message)
{
    (void) message;
    return (empty_str);
}

bool send_to_room_request(const std::string& message)
{
    (void) message;
    return (false);
}

bool new_room_request(const std::string& message)
{
    (void) message;
    return (false);
}

const std::string new_room(const std::string& message)
{
    (void) message;
    return (empty_str);
}

const std::string parse_message(const std::string& message)
{
    if (new_room_request(message))
        return (new_room(message));
    if (send_to_room_request(message))
        return (send_to_room(message));
    return (empty_str);
}

void ChatRoom::on_message(websocketpp::connection_hdl hdl, message_ptr msg) {
    std::cout << "on_message called with hdl: " << hdl.lock().get()
              << " and message: " << msg->get_payload()
              << std::endl;

    const std::string reply = parse_message(msg->get_payload());
    // websocketpp::lib::error_code ec;
    (void) _client;
    // _client.send(hdl, msg->get_payload(), msg->get_opcode(), ec);
    // if (ec) {
    //     std::cout << "on_message failed because: " << ec.message() << std::endl;
    // }
}

void ChatRoom::on_open(websocketpp::connection_hdl hdl) {
    std::string hello = "Chatroom says hello!";
    websocketpp::lib::error_code ec;

    _client.send(hdl, hello, websocketpp::frame::opcode::text, ec);
    if (ec) {
        std::cout << "on_open failed because: " << ec.message() << std::endl;
    }
}

bool ChatRoom::connect()
{
    try {
        // Set logging to be pretty verbose (everything except message payloads)
        _client.set_access_channels(websocketpp::log::alevel::all);
        _client.clear_access_channels(websocketpp::log::alevel::frame_payload);

        // Initialize ASIO
        _client.init_asio();

        // Register our message handler
        _client.set_message_handler(bind(&ChatRoom::on_message,this,::_1,::_2));
        _client.set_open_handler(bind(&ChatRoom::on_open,this,::_1));

        // // Register our handlers
        // m_endpoint.set_socket_init_handler(bind(&type::on_socket_init,this,::_1));
        // //m_endpoint.set_tls_init_handler(bind(&type::on_tls_init,this,::_1));
        // m_endpoint.set_message_handler(bind(&type::on_message,this,::_1,::_2));
        // m_endpoint.set_open_handler(bind(&type::on_open,this,::_1));
        // m_endpoint.set_close_handler(bind(&type::on_close,this,::_1));
        // m_endpoint.set_fail_handler(bind(&type::on_fail,this,::_1));


        websocketpp::lib::error_code ec;
        client::connection_ptr con = _client.get_connection(_remote_uri, ec);
        if (ec) {
            std::cout << "could not create connection because: " << ec.message() << std::endl;
            return 0;
        }

        // Note that connect here only requests a connection. No network messages are
        // exchanged until the event loop starts running in the next line.
        _client.connect(con);

        // Start the ASIO io_service run loop
        // this will cause a single connection to be made to the server. _client.run()
        // will exit when this connection is closed.
        _client.run();
    } catch (websocketpp::exception const & e) {
        std::cout << e.what() << std::endl;
    }
    return (true);
}

void ChatRoom::disconnect()
{
    if (!_networking_established)
        return ;
}