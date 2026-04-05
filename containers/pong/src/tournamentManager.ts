import type { Result } from "@app/shared/api/service/common/result";
import { Result as ResultClass } from "@app/shared/api/service/common/result";
import type { ErrorResponseType } from "@app/shared/api/service/common/error";
import { TournamentPlayerSchema, TournamentMatchSchema, TournamentDataSchema } from "@app/shared/api/service/pong/pong_interfaces";
import { z } from "zod";

export type TournamentPlayer = z.infer<typeof TournamentPlayerSchema>;

export type TournamentMatch = z.infer<typeof TournamentMatchSchema>;

export type Tournament = z.infer<typeof TournamentDataSchema>;

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
    maxScore: number,
    playerUsernames: { [key: number]: string } = {},
    allowPowerups: boolean = false,
    aiDifficulty: number = 3,
    isLocal: boolean = false,
    hostUserId?: number
  ): Result<Tournament, ErrorResponseType> {
    if (playerIds.length < 2) {
      return ResultClass.Err({
        message: "Tournament requires at least 2 players",
      });
    }

    const totalRounds = Math.ceil(Math.log2(playerIds.length));

    const tournament: Tournament = {
      tournamentId: this.nextTournamentId++,
      name,
      mode: "tournament",
      players: playerIds.map((userId) => ({
        userId,
        username: playerUsernames[userId] || `Player ${userId}`,
        alias: playerUsernames[userId] || `Player ${userId}`,
      })),
      matches: [],
      currentRound: 1,
      totalRounds,
      status: "in_progress",
      winnerId: null,
      ballCount,
      maxScore,
      allowPowerups,
      aiDifficulty,
      onchainTxHashes: [],
      isLocal,
      ...(hostUserId !== undefined ? { hostUserId } : {}),
    };

    this.generateBracket(tournament);

    this.tournaments.set(tournament.tournamentId, tournament);
    return ResultClass.Ok(tournament);
  }

  ensureBracketGenerated(tournamentId: number): Result<Tournament, ErrorResponseType> {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      return ResultClass.Err({ message: "Tournament not found" });
    }

    if (tournament.status === "registration" && tournament.matches.length === 0) {
      this.generateBracket(tournament);
      tournament.status = "in_progress";
    }

    return ResultClass.Ok(tournament);
  }

  getAllReadyMatches(tournamentId: number): TournamentMatch[] {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) return [];

    return tournament.matches.filter(m =>
      m.status === "pending" &&
      m.player1Id !== null &&
      m.player2Id !== null
    );
  }

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

    if (match.player1Id !== userId && match.player2Id !== userId) {
      return ResultClass.Err({ message: "Player not in this match" });
    }

    if (match.status !== "pending" || match.player1Id === null || match.player2Id === null) {
      return ResultClass.Err({ message: "Match not ready" });
    }

    if (!match.readyPlayers.includes(userId)) {
      match.readyPlayers.push(userId);
    }

    const bothReady = match.readyPlayers.includes(match.player1Id) &&
                      match.readyPlayers.includes(match.player2Id);

    return ResultClass.Ok({ match, bothReady });
  }

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

    for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = players[i];
      const playerJ = players[j];
      if (temp !== undefined && playerJ !== undefined) {
        players[i] = playerJ;
        players[j] = temp;
      }
    }

    const bracketSize = Math.pow(2, tournament.totalRounds);
    const numByes = bracketSize - players.length;

    const slots: (TournamentPlayer | null)[] = new Array(bracketSize).fill(null);
    const byePositions = new Set<number>();
    for (let b = 0; b < numByes; b++) {
      byePositions.add(bracketSize - 1 - b * 2);
    }

    let pi = 0;
    for (let i = 0; i < bracketSize; i++) {
      if (!byePositions.has(i) && pi < players.length) {
        slots[i] = players[pi] ?? null;
        pi++;
      }
    }

    const round1Matches: TournamentMatch[] = [];
    for (let i = 0; i < bracketSize; i += 2) {
      const p1 = slots[i];
      const p2 = slots[i + 1] ?? null;

      const match: TournamentMatch = {
        matchId: this.nextMatchId++,
        round: 1,
        player1Id: p1 ? p1.userId : null,
        player2Id: p2 ? p2.userId : null,
        winnerId: null,
        status: "pending",
        readyPlayers: [],
      };

      if (p1 && !p2) {
        match.winnerId = p1.userId;
        match.status = "completed";
      } else if (!p1 && p2) {
        match.winnerId = p2.userId;
        match.status = "completed";
      }

      round1Matches.push(match);
    }

    tournament.matches = round1Matches;

    let previousRoundSize = round1Matches.length;
    for (let round = 2; round <= tournament.totalRounds; round++) {
      const currentRoundSize = previousRoundSize / 2;
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

    for (const match of round1Matches) {
      if (match.status === "completed" && match.winnerId !== null) {
        this.advanceWinner(tournament, match);
      }
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

    if (!tournament.isLocal && match.player1Id !== userId && match.player2Id !== userId) {
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

    this.advanceWinner(tournament, match);

    if (this.isTournamentComplete(tournament)) {
      tournament.status = "completed";
      tournament.winnerId = winnerId;
    }

    if (tournament.status === "completed") {
      try {
        const internalSecret = process.env.INTERNAL_API_SECRET || "";
        const url = `http://localhost:${process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || "3000"}/api/pong/blockchain/record_score`;
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-secret": internalSecret,
            },
            body: JSON.stringify({ tournamentId: tournamentId, playerAddress: undefined, score: Math.abs(winnerId) }),
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
      return;
    }

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

    if (nextMatch.player1Id === null) {
      nextMatch.player1Id = completedMatch.winnerId;
    } else if (nextMatch.player2Id === null) {
      nextMatch.player2Id = completedMatch.winnerId;
    }

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

  removeTournament(tournamentId: number): void {
    this.tournaments.delete(tournamentId);
  }

  getActiveTournamentForPlayer(userId: number): Tournament | undefined {
    for (const tournament of this.tournaments.values()) {
      if (tournament.status !== "completed" &&
          tournament.players.some(p => p.userId === userId)) {
        return tournament;
      }
    }
    return undefined;
  }

}

export default TournamentManager;

