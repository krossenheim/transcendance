"use strict";
const { DatabaseSync } = require('node:sqlite');
class Database {
    constructor(dbPath = 'inception.db') {
        this.db = new DatabaseSync(dbPath);
        this._initializeTables();
        this.db.exec('PRAGMA foreign_keys = ON');
    }
    _initializeTables() {
        this.db.exec(`
			CREATE TABLE IF NOT EXISTS users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				createdAt INTEGER DEFAULT (strftime('%s', 'now')),
				username TEXT NOT NULL UNIQUE,
				email TEXT NOT NULL UNIQUE,
				passwordHash TEXT DEFAULT NULL
			) STRICT;

			CREATE TABLE IF NOT EXISTS player_game_results (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				userId INTEGER NOT NULL,
				score INTEGER NOT NULL,
				rank INTEGER NOT NULL,
				FOREIGN KEY(userId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
			) STRICT;
		`);
    }
    fetchAllUsers() {
        const stmt = this.db.prepare('SELECT users.id, createdAt, username, email, score, rank FROM users INNER JOIN player_game_results ON users.id = player_game_results.userId');
        return stmt.all();
    }
    fetchUserGameResults(userId) {
        const stmt = this.db.prepare(`SELECT * FROM player_game_results WHERE userId = ?`);
        return stmt.all(userId);
    }
    fetchUserById(id) {
        const stmt = this.db.prepare(`SELECT id, createdAt, username, email FROM users WHERE id = ?`);
        return {
            ...stmt.get(id),
            gameResults: this.fetchUserGameResults(id)
        };
    }
    createNewUser(username, email, passwordHash) {
        console.log("Creating user in database:", username, email);
        const stmt = this.db.prepare('INSERT INTO users (username, email, passwordHash) VALUES (?, ?, ?)');
        console.log("Prepared statement:", stmt);
        const info = stmt.run(username, email, passwordHash);
        console.log("Insert info:", info);
        return this.fetchUserById(info.lastInsertRowid);
    }
    fetchUserFromCredentials(username, passwordHash) {
        const stmt = this.db.prepare('SELECT * FROM users WHERE username = ? AND passwordHash = ?');
        return stmt.get(username, passwordHash);
    }
    close() {
        this.db.close();
    }
}
module.exports = Database;
