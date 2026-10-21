import './style.css';
import { GameEngine } from './engine/GameEngine';

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('canvas-container');
  if (!container) {
    throw new Error('Canvas container #canvas-container element not found');
  }

  // Initialize Game Engine
  const engine = new GameEngine(container);

  // Expose on window for easy developer debugging / testing
  (window as any).__flappyEngine = engine;
});
