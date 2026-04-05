
import { useMemo } from 'react';

interface PredictedBall {
    id: number;
    x: number;
    y: number;
    dx: number;
    dy: number;
    radius: number;
}

interface PredictedPaddle {
    paddle_id: number;
    owner_id: number;
    x: number;
    y: number;
    r: number;
    w: number;
    l: number;
}

interface PredictedGameState {
    board_id: number | null;
    balls: PredictedBall[];
    paddles: PredictedPaddle[];
    edges: Array<{ x: number; y: number }>;
    metadata: any;
    powerups: any[];
    score: any;
    gameOver: boolean;
    winner: number | null;
}

export function usePredictedGameState(
    serverGameState: any,
    myUserId: number,
    pressedKeys: string[]
): PredictedGameState | null {
    return useMemo(() => {
        if (!serverGameState || !serverGameState.board_id) {
            return null;
        }

        const balls: PredictedBall[] = (serverGameState.balls || []).map((b: any, idx: number) => {
            if (Array.isArray(b)) {
                const ballId = Number.isFinite(Number(b[6])) ? Number(b[6]) : idx
                return {
                    id: ballId,
                    x: b[0] ?? 0,
                    y: b[1] ?? 0,
                    dx: b[2] ?? 0,
                    dy: b[3] ?? 0,
                    radius: b[4] ?? 10,
                };
            }
            return {
                id: b.id ?? idx,
                x: b.x ?? 0,
                y: b.y ?? 0,
                dx: b.dx ?? 0,
                dy: b.dy ?? 0,
                radius: b.radius ?? 10,
            };
        });

        const paddles: PredictedPaddle[] = (serverGameState.paddles || []).map((p: any, idx: number) => {
            if (Array.isArray(p)) {
                return {
                    paddle_id: p[7] ?? idx,
                    owner_id: p[7] ?? idx,
                    x: p[0] ?? 0,
                    y: p[1] ?? 0,
                    r: p[2] ?? 0,
                    w: p[3] ?? 10,
                    l: p[4] ?? 50,
                };
            }
            return {
                paddle_id: p.paddle_id ?? p.owner_id ?? idx,
                owner_id: p.owner_id ?? p.paddle_id ?? idx,
                x: p.x ?? 0,
                y: p.y ?? 0,
                r: p.r ?? 0,
                w: p.w ?? 10,
                l: p.l ?? 50,
            };
        });

        return {
            board_id: serverGameState.board_id,
            balls,
            paddles,
            edges: serverGameState.edges || [],
            metadata: serverGameState.metadata,
            powerups: serverGameState.powerups || [],
            score: serverGameState.score,
            gameOver: serverGameState.gameOver || false,
            winner: serverGameState.winner || null,
        };
    }, [serverGameState]);
}

