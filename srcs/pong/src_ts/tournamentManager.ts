import type { Result } from "./utils/api/service/common/result.js";
import { Result as ResultClass } from "./utils/api/service/common/result.js";
import type { ErrorResponseType } from "./utils/api/service/common/error.js";

export interface TournamentPlayer {
  userId: number;
  username: string;
  alias?: string;
}

export interface TournamentMatch {
  matchId: number;
  round: number;
  player1Id: number | null;
  player2Id: number | null;
  winnerId: number | null;
  status: "pending" | "in_progress" | "completed";
  gameId?: number; // Associated pong game ID when started
}

export interface Tournament {
  tournamentId: number;
  name: string;
  mode: "tournament_1v1" | "tournament_multi";
  players: TournamentPlayer[];
  matches: TournamentMatch[];
  currentRound: number;
  totalRounds: number;
  status: "registration" | "in_progress" | "completed";
  winnerId: number | null;
  ballCount: number;
  maxScore: number;
}

export class TournamentManager {
  private tournaments: Map<number, Tournament>;
  private nextTournamentId: number;
  private nextMatchId: number;

  constructor() {
    this.tournaments = new Map();
    this.nextTournamentId = 1;
    this.nextMatchId = 1;
  }

  createTournament(
    name: string,
    mode: "tournament_1v1" | "tournament_multi",
    playerIds: number[],
    ballCount: number,
    maxScore: number
  ): Result<Tournament, ErrorResponseType> {
    if (playerIds.length < 2) {
      return ResultClass.Err({
        message: "Tournament requires at least 2 players",
      });
    }

    // For proper bracket, ideally should be power of 2
    // But we'll handle odd numbers by giving byes
    const totalRounds = Math.ceil(Math.log2(playerIds.length));

    const tournament: Tournament = {
      tournamentId: this.nextTournamentId++,
      name,
      mode,
      players: playerIds.map((userId) => ({
        userId,
        username: `Player ${userId}`,
      })),
      matches: [],
      currentRound: 1,
      totalRounds,
      status: "registration",
      winnerId: null,
      ballCount,
      maxScore,
    };

    this.tournaments.set(tournament.tournamentId, tournament);
    return ResultClass.Ok(tournament);
  }

  setPlayerAlias(
    tournamentId: number,
    userId: number,
    alias: string
  ): Result<Tournament, ErrorResponseType> {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      return ResultClass.Err({ message: "Tournament not found" });
    }

    const player = tournament.players.find((p) => p.userId === userId);
    if (!player) {
      return ResultClass.Err({ message: "Player not in tournament" });
    }

    if (tournament.status !== "registration") {
      return ResultClass.Err({
        message: "Tournament has already started",
      });
    }

    player.alias = alias;

    // Check if all players have aliases - if so, generate bracket and start
    const allHaveAliases = tournament.players.every((p) => p.alias);
    if (allHaveAliases) {
      this.generateBracket(tournament);
      tournament.status = "in_progress";
    }

    return ResultClass.Ok(tournament);
  }

  private generateBracket(tournament: Tournament): void {
    const players = [...tournament.players];
    
    // Shuffle players for random seeding
    for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = players[i];
      const playerJ = players[j];
      if (temp !== undefined && playerJ !== undefined) {
        players[i] = playerJ;
        players[j] = temp;
      }
    }

    // Round 1: Pair up all players
    const round1Matches: TournamentMatch[] = [];
    for (let i = 0; i < players.length; i += 2) {
      const player1 = players[i];
      const player2 = i + 1 < players.length ? players[i + 1] : null;
      
      if (!player1) continue; // Safety check
      
      const match: TournamentMatch = {
        matchId: this.nextMatchId++,
        round: 1,
        player1Id: player1.userId,
        player2Id: player2 ? player2.userId : null,
        winnerId: null,
        status: "pending",
      };

      // If player2 is null (odd number), player1 gets a bye
      if (match.player2Id === null) {
        match.winnerId = match.player1Id;
        match.status = "completed";
      }

      round1Matches.push(match);
    }

    tournament.matches = round1Matches;

    // Generate empty matches for subsequent rounds
    let previousRoundSize = round1Matches.length;
    for (let round = 2; round <= tournament.totalRounds; round++) {
      const currentRoundSize = Math.ceil(previousRoundSize / 2);
      for (let i = 0; i < currentRoundSize; i++) {
        tournament.matches.push({
          matchId: this.nextMatchId++,
          round,
          player1Id: null,
          player2Id: null,
          winnerId: null,
          status: "pending",
        });
      }
      previousRoundSize = currentRoundSize;
    }
  }

  startTournamentMatch(
    tournamentId: number,
    matchId: number,
    userId: number,
    gameId: number
  ): Result<TournamentMatch, ErrorResponseType> {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      return ResultClass.Err({ message: "Tournament not found" });
    }

    const match = tournament.matches.find((m) => m.matchId === matchId);
    if (!match) {
      return ResultClass.Err({ message: "Match not found" });
    }

    if (match.player1Id !== userId && match.player2Id !== userId) {
      return ResultClass.Err({ message: "You are not in this match" });
    }

    if (match.status !== "pending") {
      return ResultClass.Err({ message: "Match already started or completed" });
    }

    if (match.player1Id === null || match.player2Id === null) {
      return ResultClass.Err({ message: "Match players not yet determined" });
    }

    match.status = "in_progress";
    match.gameId = gameId;

    return ResultClass.Ok(match);
  }

  recordMatchWinner(
    tournamentId: number,
    matchId: number,
    winnerId: number
  ): Result<Tournament, ErrorResponseType> {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      return ResultClass.Err({ message: "Tournament not found" });
    }

    const match = tournament.matches.find((m) => m.matchId === matchId);
    if (!match) {
      return ResultClass.Err({ message: "Match not found" });
    }

    if (match.player1Id !== winnerId && match.player2Id !== winnerId) {
      return ResultClass.Err({ message: "Winner must be one of the players" });
    }

    match.winnerId = winnerId;
    match.status = "completed";

    // Advance winner to next round
    this.advanceWinner(tournament, match);

    // Check if tournament is complete
    if (this.isTournamentComplete(tournament)) {
      tournament.status = "completed";
      tournament.winnerId = winnerId;
    }

    return ResultClass.Ok(tournament);
  }

  private advanceWinner(tournament: Tournament, completedMatch: TournamentMatch): void {
    const nextRound = completedMatch.round + 1;
    if (nextRound > tournament.totalRounds) {
      return; // Tournament complete
    }

    // Find which slot in the next round this winner goes to
    const matchesInPrevRound = tournament.matches.filter(
      (m) => m.round === completedMatch.round
    );
    const matchIndexInRound = matchesInPrevRound.findIndex(
      (m) => m.matchId === completedMatch.matchId
    );
    const slotInNextMatch = Math.floor(matchIndexInRound / 2);

    const nextRoundMatches = tournament.matches.filter((m) => m.round === nextRound);
    const nextMatch = nextRoundMatches[slotInNextMatch];

    if (!nextMatch) return;

    // Fill the first empty player slot
    if (nextMatch.player1Id === null) {
      nextMatch.player1Id = completedMatch.winnerId;
    } else if (nextMatch.player2Id === null) {
      nextMatch.player2Id = completedMatch.winnerId;
    }

    // If both players are now filled, mark as ready
    if (nextMatch.player1Id !== null && nextMatch.player2Id !== null) {
      nextMatch.status = "pending";
    }
  }

  private isTournamentComplete(tournament: Tournament): boolean {
    const finalMatch = tournament.matches.find(
      (m) => m.round === tournament.totalRounds && m.status === "completed"
    );
    return !!finalMatch;
  }

  getTournament(tournamentId: number): Tournament | undefined {
    return this.tournaments.get(tournamentId);
  }

  getTournamentForPlayer(userId: number): Tournament | undefined {
    for (const tournament of this.tournaments.values()) {
      if (tournament.players.some((p) => p.userId === userId)) {
        return tournament;
      }
    }
    return undefined;
  }

  getPlayerMatches(
    tournamentId: number,
    userId: number
  ): Result<TournamentMatch[], ErrorResponseType> {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      return ResultClass.Err({ message: "Tournament not found" });
    }

    const matches = tournament.matches.filter(
      (m) => m.player1Id === userId || m.player2Id === userId
    );

    return ResultClass.Ok(matches);
  }
}

export default TournamentManager;
