/**
 * usePredictedGameState - Hook that runs client-side prediction for smooth rendering
 * 
 * Takes server game state updates and:
 * 1. Initializes a local ClientPongSimulation
 * 2. Runs simulation forward each frame
 * 3. Reconciles with server state when updates arrive
 * 4. Returns smooth predicted state for rendering
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { ClientPongSimulation } from '../physics/ClientPongSimulation';

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
    const simulationRef = useRef<ClientPongSimulation | null>(null);
    const lastFrameTimeRef = useRef<number>(performance.now());
    const animationFrameRef = useRef<number | null>(null);
    const [predictedState, setPredictedState] = useState<PredictedGameState | null>(null);
    
    // Track if simulation is initialized
    const isInitializedRef = useRef<boolean>(false);
    
    // Store latest server state in a ref so the prediction loop always has fresh data
    const serverStateRef = useRef<any>(serverGameState);
    useEffect(() => {
        serverStateRef.current = serverGameState;
    }, [serverGameState]);
    
    // Store latest pressed keys for simulation
    const pressedKeysRef = useRef<string[]>(pressedKeys);
    useEffect(() => {
        pressedKeysRef.current = pressedKeys;
        if (simulationRef.current) {
            simulationRef.current.setPressedKeys(pressedKeys);
        }
    }, [pressedKeys]);

    // Initialize or reinitialize simulation when server state changes significantly
    useEffect(() => {
        if (!serverGameState || !serverGameState.board_id) {
            isInitializedRef.current = false;
            return;
        }
        
        // Create simulation if it doesn't exist
        if (!simulationRef.current) {
            simulationRef.current = new ClientPongSimulation();
        }
        
        // Initialize from server state
        simulationRef.current.initFromServerState(serverGameState, myUserId);
        simulationRef.current.setPressedKeys(pressedKeysRef.current);
        isInitializedRef.current = true;
        
    }, [serverGameState?.board_id, myUserId]);

    // Reconcile with server state on each update
    useEffect(() => {
        if (!serverGameState || !simulationRef.current || !isInitializedRef.current) {
            // Just pass through server state when not predicting
            if (serverGameState) {
                setPredictedState(serverGameState);
            }
            return;
        }
        
        // Smooth reconciliation - blend toward server state
        simulationRef.current.reconcileWithServer(serverGameState, 0.15);
        
    }, [serverGameState]);

    // Run prediction loop
    useEffect(() => {
        if (!serverGameState || !serverGameState.board_id) return;
        
        const runPrediction = () => {
            const now = performance.now();
            const deltaTime = (now - lastFrameTimeRef.current) / 1000;
            lastFrameTimeRef.current = now;
            
            // Use the ref to get latest server state
            const latestServerState = serverStateRef.current;
            
            if (simulationRef.current && isInitializedRef.current && latestServerState) {
                // Run simulation forward
                simulationRef.current.simulate(deltaTime);
                
                // Get predicted state for rendering
                const predicted = simulationRef.current.getState();
                
                // Convert to the format BabylonPongRenderer expects
                // Use latest server state for non-predicted fields (powerups, score, etc.)
                // For paddles, use SERVER positions (not predicted) to avoid fighting with server
                const convertedState: PredictedGameState = {
                    board_id: latestServerState.board_id,
                    balls: predicted.balls.map(b => ({
                        id: b.id,
                        x: b.x,
                        y: b.y,
                        dx: b.dx,
                        dy: b.dy,
                        radius: b.radius,
                    })),
                    // Use server paddle positions - the BabylonRenderer already has lerp smoothing
                    paddles: (latestServerState.paddles || []).map((p: any) => {
                        if (Array.isArray(p)) {
                            return {
                                paddle_id: p[7] ?? 0,
                                owner_id: p[7] ?? 0,
                                x: p[0] ?? 0,
                                y: p[1] ?? 0,
                                r: p[2] ?? 0,
                                w: p[3] ?? 10,
                                l: p[4] ?? 50,
                            };
                        }
                        return {
                            paddle_id: p.paddle_id ?? p.owner_id ?? 0,
                            owner_id: p.owner_id ?? p.paddle_id ?? 0,
                            x: p.x ?? 0,
                            y: p.y ?? 0,
                            r: p.r ?? 0,
                            w: p.w ?? 10,
                            l: p.l ?? 50,
                        };
                    }),
                    edges: latestServerState.edges || [],
                    metadata: latestServerState.metadata,
                    powerups: latestServerState.powerups || [],
                    score: latestServerState.score,
                    gameOver: latestServerState.gameOver || false,
                    winner: latestServerState.winner || null,
                };
                
                setPredictedState(convertedState);
            }
            
            animationFrameRef.current = requestAnimationFrame(runPrediction);
        };
        
        lastFrameTimeRef.current = performance.now();
        animationFrameRef.current = requestAnimationFrame(runPrediction);
        
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [serverGameState?.board_id]);

    return predictedState;
}
