/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Particle, Point, GameState } from './types';
import { COLORS, GAME_CONFIG } from './constants';

// --- Audio Engine ---
class AudioEngine {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  private playTone(freq: number, type: OscillatorType, duration: number, volume: number) {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playCollision() {
    this.playTone(150, 'sawtooth', 0.5, 0.2);
    this.playTone(60, 'sine', 0.8, 0.4);
  }

  playScore() {
    this.playTone(880, 'sine', 0.2, 0.1);
    setTimeout(() => this.playTone(1320, 'sine', 0.2, 0.1), 100);
  }

  playGameOver() {
    this.playTone(200, 'square', 1.0, 0.2);
    this.playTone(100, 'sine', 1.5, 0.3);
  }
}

const audio = new AudioEngine();

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    health: GAME_CONFIG.INITIAL_HEALTH,
    isGameOver: false,
    isPaused: true,
  });
  const [flash, setFlash] = useState(false);
  const [damageFlash, setDamageFlash] = useState(false);

  // Game refs for high-performance loop
  const playerPos = useRef<Point>({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const enemies = useRef<Particle[]>([]);
  const trails = useRef<Particle[]>([]);
  const bursts = useRef<Particle[]>([]);
  const frameId = useRef<number>(0);
  const bgHue = useRef<number>(280); // Start at purple

  const spawnEnemy = useCallback((width: number, height: number) => {
    const side = Math.floor(Math.random() * 4);
    let x = 0, y = 0;
    const speed = 2 + Math.random() * 4;
    const size = 5 + Math.random() * 10;
    const colors = [COLORS.PINK, COLORS.CYAN, COLORS.PURPLE, COLORS.NEON_GREEN];
    const color = colors[Math.floor(Math.random() * colors.length)];

    switch (side) {
      case 0: x = -20; y = Math.random() * height; break; // Left
      case 1: x = width + 20; y = Math.random() * height; break; // Right
      case 2: x = Math.random() * width; y = -20; break; // Top
      case 3: x = Math.random() * width; y = height + 20; break; // Bottom
    }

    const angle = Math.atan2(playerPos.current.y - y, playerPos.current.x - x);
    enemies.current.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      color,
      type: 'enemy'
    });
  }, []);

  const update = useCallback(() => {
    if (gameState.isPaused || gameState.isGameOver) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;

    // Background: Dynamic fluid gradient
    bgHue.current = (bgHue.current + 0.2) % 360;
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, `hsla(${bgHue.current}, 70%, 20%, 1)`);
    gradient.addColorStop(0.5, `hsla(${(bgHue.current + 60) % 360}, 70%, 20%, 1)`);
    gradient.addColorStop(1, `hsla(${(bgHue.current + 120) % 360}, 70%, 20%, 1)`);
    
    ctx.fillStyle = flash ? '#FFFFFF' : gradient;
    if (flash) setFlash(false);
    ctx.fillRect(0, 0, width, height);

    // Player Trail
    trails.current.push({
      x: playerPos.current.x,
      y: playerPos.current.y,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: Math.random() * 5 + 2,
      color: `hsla(${(bgHue.current + 180) % 360}, 100%, 70%, 1)`,
      life: GAME_CONFIG.TRAIL_LIFE,
      maxLife: GAME_CONFIG.TRAIL_LIFE,
      type: 'trail'
    });

    // Update & Draw Trails
    trails.current = trails.current.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life! -= 1;
      const alpha = p.life! / p.maxLife!;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color.replace('1)', `${alpha})`);
      ctx.fill();
      return p.life! > 0;
    });

    // Update & Draw Bursts
    bursts.current = bursts.current.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life! -= 1;
      const alpha = p.life! / p.maxLife!;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color.replace('1)', `${alpha})`);
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.color;
      ctx.fill();
      ctx.shadowBlur = 0;
      return p.life! > 0;
    });

    // Update & Draw Enemies
    if (Math.random() < GAME_CONFIG.ENEMY_SPAWN_RATE + (gameState.score / 5000)) {
      spawnEnemy(width, height);
    }

    enemies.current = enemies.current.filter(enemy => {
      enemy.x += enemy.vx;
      enemy.y += enemy.vy;

      // Collision detection
      const dx = enemy.x - playerPos.current.x;
      const dy = enemy.y - playerPos.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < enemy.size + GAME_CONFIG.PLAYER_SIZE) {
        // Collision!
        setFlash(true);
        setDamageFlash(true);
        setTimeout(() => setDamageFlash(false), 200);
        audio.playCollision();
        
        // Burst effect
        for (let i = 0; i < GAME_CONFIG.BURST_PARTICLES; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = Math.random() * 8 + 2;
          bursts.current.push({
            x: enemy.x,
            y: enemy.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: Math.random() * 4 + 2,
            color: Math.random() > 0.5 ? COLORS.WHITE : enemy.color,
            life: 60,
            maxLife: 60,
            type: 'burst'
          });
        }

        setGameState(prev => {
          const newHealth = Math.max(0, prev.health - GAME_CONFIG.COLLISION_DAMAGE);
          if (newHealth <= 0) {
            audio.playGameOver();
            return { ...prev, health: 0, isGameOver: true };
          }
          return { ...prev, health: newHealth };
        });
        return false; // Remove enemy
      }

      // Draw Enemy
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.size, 0, Math.PI * 2);
      ctx.fillStyle = enemy.color;
      ctx.shadowBlur = 15;
      ctx.shadowColor = enemy.color;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Remove if off screen
      return (
        enemy.x > -50 && enemy.x < width + 50 &&
        enemy.y > -50 && enemy.y < height + 50
      );
    });

    // Draw Player
    ctx.beginPath();
    ctx.arc(playerPos.current.x, playerPos.current.y, GAME_CONFIG.PLAYER_SIZE, 0, Math.PI * 2);
    const playerGrad = ctx.createRadialGradient(
      playerPos.current.x, playerPos.current.y, 0,
      playerPos.current.x, playerPos.current.y, GAME_CONFIG.PLAYER_SIZE
    );
    playerGrad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    playerGrad.addColorStop(1, `hsla(${(bgHue.current + 180) % 360}, 100%, 70%, 0.4)`);
    ctx.fillStyle = playerGrad;
    ctx.shadowBlur = 20;
    ctx.shadowColor = `hsla(${(bgHue.current + 180) % 360}, 100%, 70%, 1)`;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Update Score
    setGameState(prev => {
      const newScore = prev.score + 1;
      if (newScore % 1000 === 0) audio.playScore();
      return { ...prev, score: newScore };
    });

    frameId.current = requestAnimationFrame(update);
  }, [gameState.isPaused, gameState.isGameOver, gameState.score, spawnEnemy, flash]);

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      playerPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const step = 20;
      switch (e.key) {
        case 'ArrowUp': playerPos.current.y -= step; break;
        case 'ArrowDown': playerPos.current.y += step; break;
        case 'ArrowLeft': playerPos.current.x -= step; break;
        case 'ArrowRight': playerPos.current.x += step; break;
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', handleKeyDown);
    handleResize();

    frameId.current = requestAnimationFrame(update);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(frameId.current);
    };
  }, [update]);

  const startGame = () => {
    setGameState({
      score: 0,
      health: GAME_CONFIG.INITIAL_HEALTH,
      isGameOver: false,
      isPaused: false,
    });
    enemies.current = [];
    trails.current = [];
    bursts.current = [];
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black font-sans select-none cursor-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />

      {/* UI Overlay */}
      <div className="absolute inset-0 pointer-events-none p-8 flex flex-col justify-between">
        <div className="flex justify-between items-start">
          {/* Score */}
          <div className="text-4xl font-bold tracking-tighter text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
            <span className="text-cyan-400 font-mono">SCORE:</span> {gameState.score.toLocaleString()}
          </div>

          {/* Health Ring */}
          <div className="relative w-24 h-24 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90">
              <circle
                cx="48" cy="48" r="40"
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="8"
              />
              <motion.circle
                cx="48" cy="48" r="40"
                fill="none"
                stroke={damageFlash ? COLORS.NEON_RED : COLORS.NEON_GREEN}
                strokeWidth="8"
                strokeDasharray={251.2}
                animate={{
                  strokeDashoffset: 251.2 - (251.2 * gameState.health) / 100,
                  scale: damageFlash ? 1.1 : 1,
                }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                style={{
                  filter: `drop-shadow(0 0 8px ${damageFlash ? COLORS.NEON_RED : COLORS.NEON_GREEN})`,
                }}
              />
            </svg>
            <div className={`absolute text-xl font-bold ${damageFlash ? 'text-red-500 animate-pulse' : 'text-white'}`}>
              {gameState.health}%
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="flex justify-center">
          <h1 className="text-8xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 opacity-20 select-none">
            NEONFLOW
          </h1>
        </div>
      </div>

      {/* Start/Game Over Screens */}
      <AnimatePresence>
        {(gameState.isPaused || gameState.isGameOver) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-colorful-black animate-colorful-black backdrop-blur-sm z-50"
          >
            <div className="text-center p-12 rounded-3xl border border-white/10 bg-white/5 shadow-2xl pointer-events-auto">
              <h2 className="text-7xl font-black italic tracking-tighter text-white mb-4">
                {gameState.isGameOver ? 'GAME OVER' : 'NEONFLOW'}
              </h2>
              {gameState.isGameOver && (
                <p className="text-2xl text-cyan-400 mb-8 font-mono">
                  FINAL SCORE: {gameState.score.toLocaleString()}
                </p>
              )}
              <button
                onClick={startGame}
                className="px-12 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-2xl font-bold rounded-full hover:scale-105 active:scale-95 transition-transform shadow-[0_0_30px_rgba(168,85,247,0.5)] cursor-pointer"
              >
                {gameState.isGameOver ? 'TRY AGAIN' : 'START FLOW'}
              </button>
              {!gameState.isGameOver && (
                <div className="mt-8 text-white/50 text-sm font-mono uppercase tracking-widest">
                  Mouse to move • Dodge the light
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
