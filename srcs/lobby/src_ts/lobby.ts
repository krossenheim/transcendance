



enum LobbyType {
    MultiplayerGame = 0,
    TOURNAMENT_RANKED = 1,
    TOURNAMENT_LAST_ONE_STANDING = 2,
};

interface PlayerData {
    id: number,
    tournament_elo: number
}

interface GameData {
    id: number,
}

class BasicLobby {
    private players: PlayerData[];
    private type: LobbyType;
    private games: Map<number, GameData>;

    constructor(type: LobbyType) {
        this.games = new Map<number, GameData>();
        this.players = [];
        this.type = type;
    }


}