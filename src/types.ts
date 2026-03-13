export interface Point {
  x: number;
  y: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life?: number; // For trails or bursts
  maxLife?: number;
  type: 'enemy' | 'trail' | 'burst';
}

export interface GameState {
  score: number;
  health: number;
  isGameOver: boolean;
  isPaused: boolean;
}
