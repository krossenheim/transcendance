class User {
	constructor(db_data) {
		this.id = db_data.id;
		this.username = db_data.username;
		this.email = db_data.email;
        this.created_at = db_data.created_at;
		this.password_hash = db_data.password_hash;
	}

	publicWebData() {
		return {
			id: this.id,
			username: this.username,
            created_at: this.created_at,
		}
	}

	privateWebData() {
		return {
			id: this.id,
			username: this.username,
            created_at: this.created_at,
			email: this.email,
		}
	}

	fullData() {
		return {
			id: this.id,
			username: this.username,
            created_at: this.created_at,
			email: this.email,
			password_hash: this.password_hash,
		}
	}
}

module.exports = { User };