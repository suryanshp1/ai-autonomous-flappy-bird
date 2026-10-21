export class TelemetryGraph {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private readonly maxSamples = 65;
  private birdHistory: number[] = [];
  private gapHistory: number[] = [];

  constructor(canvasId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
  }

  public pushSample(birdY: number, gapCenterY: number): void {
    this.birdHistory.push(birdY);
    this.gapHistory.push(gapCenterY);

    if (this.birdHistory.length > this.maxSamples) {
      this.birdHistory.shift();
      this.gapHistory.shift();
    }

    this.draw();
  }

  private draw(): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, w, h);

    // Subtle background grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.25);
    ctx.lineTo(w, h * 0.25);
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w, h * 0.5);
    ctx.moveTo(0, h * 0.75);
    ctx.lineTo(w, h * 0.75);
    ctx.stroke();

    if (this.birdHistory.length < 2) return;

    const minY = 0.0;
    const maxY = 11.0;
    const stepX = w / (this.maxSamples - 1);
    const toScreenY = (val: number) => h - ((val - minY) / (maxY - minY)) * h;

    // 1. Draw Safe Clearance Corridor Band (gapCenter +/- 1.25m)
    ctx.fillStyle = 'rgba(0, 255, 136, 0.08)';
    ctx.beginPath();
    for (let i = 0; i < this.gapHistory.length; i++) {
      const x = i * stepX;
      const yTop = toScreenY(this.gapHistory[i] + 1.25);
      if (i === 0) ctx.moveTo(x, yTop);
      else ctx.lineTo(x, yTop);
    }
    for (let i = this.gapHistory.length - 1; i >= 0; i--) {
      const x = i * stepX;
      const yBot = toScreenY(this.gapHistory[i] - 1.25);
      ctx.lineTo(x, yBot);
    }
    ctx.closePath();
    ctx.fill();

    // 2. Draw Target Gap Center Line (dashed amber)
    ctx.strokeStyle = 'rgba(255, 183, 3, 0.65)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (let i = 0; i < this.gapHistory.length; i++) {
      const x = i * stepX;
      const y = toScreenY(this.gapHistory[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Draw Bird Trajectory Line (glowing neon cyan)
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2.0;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    for (let i = 0; i < this.birdHistory.length; i++) {
      const x = i * stepX;
      const y = toScreenY(this.birdHistory[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  public reset(): void {
    this.birdHistory = [];
    this.gapHistory = [];
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
