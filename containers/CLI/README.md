# Pong CLI

A terminal-based Pong client that connects to the Pong web server, allowing CLI users to play against web users in real-time.

## Features

- **Cross-platform gameplay**: Play against web users from the terminal
- **Real-time synchronization**: WebSocket-based communication for live game state
- **User authentication**: Login with existing credentials, including 2FA support
- **Multiple game modes**: Classic 1v1, 2v2, and free-for-all
- **Customizable settings**: Configure ball count, max score, and powerups
- **Terminal UI**: Full ncurses-based interface with colors

## Requirements

### Build Dependencies

- GCC compiler
- Make
- libcurl (for HTTP authentication)
- libwebsockets (for WebSocket communication)  
- ncurses (for terminal UI)
- OpenSSL (for SSL/TLS support)
- pthreads

### Installing Dependencies

On Debian/Ubuntu:

```bash
make deps
```

Or manually:

```bash
sudo apt-get install -y \
    libcurl4-openssl-dev \
    libwebsockets-dev \
    libncurses5-dev \
    libssl-dev
```

On macOS with Homebrew:

```bash
brew install curl libwebsockets ncurses openssl
```

## Building

```bash
# Standard build
make

# Debug build with sanitizers
make debug

# Clean build artifacts
make clean

# Full clean including binary
make fclean

# Rebuild from scratch
make re
```

## Usage

```bash
# Start with defaults (connects to localhost:443)
./pong_cli

# Connect to a specific server
./pong_cli -h example.com -p 8443

# Disable SSL (for development)
./pong_cli --no-ssl

# Show help
./pong_cli --help
```

### Controls

#### Menus
- **Up/Down Arrow** or **W/S**: Navigate
- **Enter**: Select
- **Escape**: Back/Cancel
- **Tab**: Switch input fields (login form)

#### In Game
- **Up Arrow** or **W**: Move paddle up
- **Down Arrow** or **S**: Move paddle down
- **Q**: Quit to menu

#### Lobby
- **R**: Toggle ready status
- **S**: Start game (when all players ready)
- **Q**: Leave lobby

## Architecture

```
containers/CLI/
├── Makefile           # Build system
├── README.md          # This file
├── include/           # Header files
│   ├── pong_cli.h     # Main application definitions
│   ├── auth.h         # Authentication module
│   ├── websocket.h    # WebSocket client
│   ├── game.h         # Game state management
│   ├── renderer.h     # ncurses rendering
│   ├── utils.h        # Utility functions
│   └── cJSON.h        # JSON parsing library
└── src/               # Source files
    ├── main.c         # Application entry point
    ├── auth.c         # HTTP authentication with libcurl
    ├── websocket.c    # WebSocket client with libwebsockets
    ├── game.c         # Game state and server communication
    ├── renderer.c     # Terminal UI with ncurses
    ├── utils.c        # Utility functions
    └── cJSON.c        # JSON library implementation
```

## Server Communication

### Authentication

The CLI uses HTTP REST API for authentication:

- `POST /api/auth/login` - User login
- `POST /api/auth/verify-2fa` - Two-factor authentication
- `POST /api/auth/refresh` - Token refresh
- `POST /api/auth/logout` - User logout

### WebSocket Protocol

The game uses a custom WebSocket protocol with messages formatted as:

```
container%funcId%payload
```

Where:
- `container`: Target service (e.g., "pong", "hub", "users")
- `funcId`: Function identifier (e.g., "handle_game_keys", "get_game_state")
- `payload`: JSON data

Server responses follow the format:

```
sourceContainer%funcId%code%payload
```

### Game State

Game state is received as JSON containing:
- `balls`: Array of ball tuples `[x, y, vx, vy, radius, mass, id]`
- `paddles`: Array of paddle tuples `[x, y, angle, width, height, vx, vy, playerId]`
- `walls`: Array of wall tuples `[x1, y1, x2, y2, vx, vy, playerId]`
- `score`: Object mapping player IDs to scores
- `gameOver`: Boolean indicating game end
- `winner`: Winner's player ID

## Development

### Debug Build

```bash
make debug
```

This enables:
- Debug symbols (`-g`)
- Address sanitizer
- Undefined behavior sanitizer
- No optimization

### Logging

Set the `PONG_CLI_DEBUG` environment variable to enable debug logging:

```bash
PONG_CLI_DEBUG=1 ./pong_cli
```

### Session Files

Authentication sessions are saved to `~/.pong_cli_session` for automatic re-login.

## Troubleshooting

### Connection Issues

1. **SSL Certificate Errors**: The CLI accepts self-signed certificates by default. If you're still having issues, try `--no-ssl` for development.

2. **WebSocket Connection Failed**: Ensure the server is running and accessible. Check firewall rules.

3. **Authentication Failed**: Verify your credentials are correct. Check if 2FA is enabled on your account.

### Display Issues

1. **Garbled Graphics**: Ensure your terminal supports UTF-8 and ncurses.

2. **Colors Not Working**: Make sure your terminal supports colors (`TERM=xterm-256color`).

3. **Terminal Too Small**: The game requires a minimum terminal size. Try resizing or using fullscreen.

## License

This project is part of the Crysendence ft_transcendence implementation.
