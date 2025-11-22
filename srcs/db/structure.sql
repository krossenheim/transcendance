CREATE TABLE IF NOT EXISTS users (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	createdAt INTEGER DEFAULT (strftime('%s', 'now')),
	username TEXT NOT NULL UNIQUE,
	alias TEXT DEFAULT NULL,
	email TEXT NOT NULL UNIQUE,
	bio TEXT DEFAULT NULL,
	passwordHash TEXT DEFAULT NULL,
	accountType INTEGER,
	avatarUrl TEXT DEFAULT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS idx_user_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_user_email ON users(email);

CREATE TABLE IF NOT EXISTS player_game_results (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	userId INTEGER NOT NULL,
	score INTEGER NOT NULL,
	rank INTEGER NOT NULL,
	FOREIGN KEY(userId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
) STRICT;
CREATE INDEX IF NOT EXISTS idx_game_results_userId ON player_game_results(userId);

CREATE TABLE IF NOT EXISTS user_friendships (
	userId INTEGER NOT NULL,
	friendId INTEGER NOT NULL,
	status INTEGER NOT NULL, -- 0: pending; 1: accepted; 2: blocked
	createdAt INTEGER DEFAULT (strftime('%s', 'now')),
	PRIMARY KEY (userId, friendId),
	FOREIGN KEY(userId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
	FOREIGN KEY(friendId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
) STRICT;
CREATE INDEX IF NOT EXISTS idx_user_friendships ON user_friendships(userId);

CREATE TABLE IF NOT EXISTS user_tokens (
	userId INTEGER PRIMARY KEY,
	token TEXT NOT NULL,
	createdAt INTEGER DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY(userId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
) STRICT;
CREATE INDEX IF NOT EXISTS idx_tokens_userId ON user_tokens(userId);

CREATE TABLE IF NOT EXISTS user_2fa_secrets (
	userId INTEGER PRIMARY KEY,
	encryptedSecret TEXT NOT NULL,
	isEnabled INTEGER DEFAULT 0,
	createdAt INTEGER DEFAULT (strftime('%s', 'now')),
	FOREIGN KEY(userId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
) STRICT;
CREATE INDEX IF NOT EXISTS idx_2fa_userId ON user_2fa_secrets(userId);

CREATE TABLE IF NOT EXISTS chat_rooms (
  roomId INTEGER PRIMARY KEY AUTOINCREMENT,
  roomType INTEGER NOT NULL, -- 1: private, 2: direct message
  roomName TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS idx_chat_rooms_id ON chat_rooms(roomId);

CREATE TABLE IF NOT EXISTS dm_chat_rooms_mapping (
  roomId INTEGER PRIMARY KEY,
  userOneId INTEGER NOT NULL,
  userTwoId INTEGER NOT NULL,
  FOREIGN KEY(roomId) REFERENCES chat_rooms(roomId) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY(userOneId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY(userTwoId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
) STRICT;
CREATE INDEX IF NOT EXISTS idx_dm_chat_rooms_userOneId ON dm_chat_rooms_mapping(userOneId);
CREATE INDEX IF NOT EXISTS idx_dm_chat_rooms_userTwoId ON dm_chat_rooms_mapping(userTwoId);

CREATE TABLE IF NOT EXISTS users_room_relationships (
  roomId INTEGER NOT NULL,
  userId INTEGER NOT NULL,
  userState INTEGER NOT NULL, -- 0: invited but not joined, 1: joined
  PRIMARY KEY (roomId, userId),
  FOREIGN KEY(roomId) REFERENCES chat_rooms(roomId) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY(userId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS chat_messages (
  messageId INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,
  roomId INTEGER NOT NULL,
  messageString TEXT NOT NULL,
  messageDate INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY(userId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY(roomId) REFERENCES chat_rooms(roomId) ON UPDATE CASCADE ON DELETE CASCADE
) STRICT;
CREATE INDEX IF NOT EXISTS idx_messagesId ON chat_messages(roomId);

PRAGMA foreign_keys = ON;