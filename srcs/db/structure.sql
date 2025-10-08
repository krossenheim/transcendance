DROP TABLE IF EXISTS player_game_results;
DROP TABLE IF EXISTS user_friendships;
DROP TABLE IF EXISTS users;

CREATE TABLE IF NOT EXISTS users (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	createdAt INTEGER DEFAULT (strftime('%s', 'now')),
	username TEXT NOT NULL UNIQUE,
	alias TEXT DEFAULT NULL,
	email TEXT NOT NULL UNIQUE,
	passwordHash TEXT DEFAULT NULL,
	isGuest INTEGER
) STRICT;

CREATE TABLE IF NOT EXISTS player_game_results (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	userId INTEGER NOT NULL,
	score INTEGER NOT NULL,
	rank INTEGER NOT NULL,
	FOREIGN KEY(userId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS messages (
  messageId  INTEGER PRIMARY KEY,
  userId INTEGER NOT NULL,
  roomId INTEGER NOT NULL,
  messageString VARCHAR(300) NOT NULL,
  messageDate INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY(userId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY(roomId) REFERENCES rooms(roomId) ON UPDATE CASCADE ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS rooms (
  roomId INTEGER PRIMARY KEY, 
  roomName VARCHAR(300) NOT NULL,
  users TEXT NOT NULL CHECK (json_valid(numbers)),
  whitelist TEXT NOT NULL CHECK (json_valid(numbers)),
) STRICT;

CREATE TABLE IF NOT EXISTS user_friendships (
	userId INTEGER NOT NULL,
	friendId INTEGER NOT NULL,
	createdAt INTEGER DEFAULT (strftime('%s', 'now')),
	PRIMARY KEY (userId, friendId),
	FOREIGN KEY(userId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY(friendId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS user_tokens (
	userId INTEGER PRIMARY KEY,
	token TEXT NOT NULL,
	createdAt INTEGER DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY(userId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_user_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_user_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_game_results_userId ON player_game_results(userId);
CREATE INDEX IF NOT EXISTS idx_user_friendships ON user_friendships(userId);
CREATE INDEX IF NOT EXISTS idx_tokens_userId ON user_tokens(userId);

PRAGMA foreign_keys = ON;