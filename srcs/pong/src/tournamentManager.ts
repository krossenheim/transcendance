import type { Result } from "@app/shared/api/service/common/result";
import { Result as ResultClass } from "@app/shared/api/service/common/result";
import type { ErrorResponseType } from "@app/shared/api/service/common/error";

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
  readyPlayers: number[]; // Players who clicked "Join Match"
}

export interface Tournament {
  tournamentId: number;
  name: string;
  mode: "tournament";
  players: TournamentPlayer[];
  matches: TournamentMatch[];
  currentRound: number;
  totalRounds: number;
  status: "registration" | "in_progress" | "completed";
  winnerId: number | null;
  ballCount: number;
  maxScore: number;
  onchainTxHashes?: string[];
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
      mode: "tournament",
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
      onchainTxHashes: [],
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

  /**
   * Ensure tournament bracket is generated and status is in_progress.
   * Called when first match is about to start.
   */
  ensureBracketGenerated(tournamentId: number): Result<Tournament, ErrorResponseType> {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      return ResultClass.Err({ message: "Tournament not found" });
    }

    if (tournament.status === "registration" && tournament.matches.length === 0) {
      console.log(`[TournamentManager] Auto-generating bracket for tournament ${tournamentId}`);
      this.generateBracket(tournament);
      tournament.status = "in_progress";
    }

    return ResultClass.Ok(tournament);
  }

  /**
   * Get all pending matches that are ready to start (both players set)
   */
  getAllReadyMatches(tournamentId: number): TournamentMatch[] {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) return [];

    return tournament.matches.filter(m =>
      m.status === "pending" &&
      m.player1Id !== null &&
      m.player2Id !== null
    );
  }

  /**
   * Get the next pending match for a given player
   */
  getNextPendingMatchForPlayer(tournamentId: number, userId: number): TournamentMatch | null {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) return null;

    return tournament.matches.find(m =>
      m.status === "pending" &&
      m.player1Id !== null &&
      m.player2Id !== null &&
      (m.player1Id === userId || m.player2Id === userId)
    ) || null;
  }

  /**
   * Mark a player as ready for a tournament match.
   * Returns: { match, bothReady } where bothReady indicates if both players are now ready.
   */
  markPlayerReady(
    tournamentId: number,
    matchId: number,
    userId: number
  ): Result<{ match: TournamentMatch; bothReady: boolean }, ErrorResponseType> {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      return ResultClass.Err({ message: "Tournament not found" });
    }

    const match = tournament.matches.find((m) => m.matchId === matchId);
    if (!match) {
      return ResultClass.Err({ message: "Match not found" });
    }

    // Verify player is in this match
    if (match.player1Id !== userId && match.player2Id !== userId) {
      return ResultClass.Err({ message: "Player not in this match" });
    }

    // Check if match is ready to start
    if (match.status !== "pending" || match.player1Id === null || match.player2Id === null) {
      return ResultClass.Err({ message: "Match not ready" });
    }

    // Add player to ready list if not already
    if (!match.readyPlayers.includes(userId)) {
      match.readyPlayers.push(userId);
    }

    // Check if both players are ready
    const bothReady = match.readyPlayers.includes(match.player1Id) && 
                      match.readyPlayers.includes(match.player2Id);

    return ResultClass.Ok({ match, bothReady });
  }

  /**
   * Clear ready status for a match (e.g., when needing to reset)
   */
  clearMatchReadyStatus(tournamentId: number, matchId: number): void {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) return;

    const match = tournament.matches.find((m) => m.matchId === matchId);
    if (match) {
      match.readyPlayers = [];
    }
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
        readyPlayers: [],
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
          readyPlayers: [],
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

  async recordMatchWinner(
    tournamentId: number,
    matchId: number,
    winnerId: number
  ): Promise<Result<Tournament, ErrorResponseType>> {
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

    // If tournament completed, attempt to record on-chain (best-effort)
    if (tournament.status === "completed") {
      try {
        // Instead of importing the blockchain service directly, call the
        // internal HTTP endpoint so the recording is done via the same API
        // surface used by other services. This keeps behavior consistent and
        // makes auditing easier.
        const internalSecret = process.env.INTERNAL_API_SECRET || "";
        const url = `http://localhost:${process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || "3000"}/api/pong/blockchain/record_score`;
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-secret": internalSecret,
            },
            body: JSON.stringify({ tournamentId: tournamentId, playerAddress: undefined, score: winnerId }),
          });
          if (!res.ok) {
            const text = await res.text();
            console.error("On-chain record endpoint responded with non-OK:", res.status, text);
          } else {
            const body = await res.json() as { txHash?: string };
            const txHash = body.txHash;
            if (txHash) {
              if (!tournament.onchainTxHashes) tournament.onchainTxHashes = [];
              tournament.onchainTxHashes.push(txHash);
            }
          }
        } catch (e: any) {
          console.error("Failed to call on-chain record endpoint:", e?.message || e);
        }
      } catch (err) {
        console.error("Error while attempting on-chain record:", err);
      }
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
