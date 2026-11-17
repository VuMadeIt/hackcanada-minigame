// A single full-screen canvas for everything that flies around: numbers, wood chips, leaves, coins.

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  size: number;
  color: string;
  spin?: number;
}

interface FloatText {
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  text: string;
  size: number;
  color: string;
  wobble: number;
}

interface Flyer {
  img: HTMLImageElement;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  t: number;
  delay: number;
  dur: number;
  size: number;
  onArrive?: () => void;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Fx {
  private ctx: CanvasRenderingContext2D | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private parts: Particle[] = [];
  private texts: FloatText[] = [];
  private flyers: Flyer[] = [];
  private last = 0;
  private raf = 0;
  private dpr = 1;
  font = "monospace";

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.resize();
    window.addEventListener("resize", this.resize);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  detach() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    this.canvas = null;
    this.ctx = null;
  }

  private resize = () => {
    if (!this.canvas) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = window.innerWidth * this.dpr;
    this.canvas.height = window.innerHeight * this.dpr;
  };

  text(x: number, y: number, text: string, opts: { size?: number; color?: string; life?: number; rise?: number } = {}) {
    if (this.texts.length > 70) this.texts.shift();
    this.texts.push({
      x: x + rand(-14, 14),
      y,
      vy: -(opts.rise ?? 70),
      life: 0,
      max: opts.life ?? 0.9,
      text,
      size: opts.size ?? 18,
      color: opts.color ?? "#fff7e0",
      wobble: rand(0, Math.PI * 2),
    });
  }

  chips(x: number, y: number, n: number, colors: string[], power = 1) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length > 400) this.parts.shift();
      const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const sp = rand(120, 380) * power;
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * sp + rand(-40, 40),
        vy: Math.sin(a) * sp,
        g: 900,
        life: 0,
        max: rand(0.45, 0.9),
        size: Math.round(rand(3, 7)),
        color: colors[(Math.random() * colors.length) | 0],
        spin: rand(-8, 8),
      });
    }
  }

  leaves(x0: number, x1: number, y: number, n: number, colors: string[]) {
    for (let i = 0; i < n; i++) {
      this.parts.push({
        x: rand(x0, x1),
        y: y + rand(-20, 20),
        vx: rand(-30, 30),
        vy: rand(10, 60),
        g: 40,
        life: 0,
        max: rand(1.6, 2.8),
        size: Math.round(rand(4, 6)),
        color: colors[(Math.random() * colors.length) | 0],
        spin: rand(-3, 3),
      });
    }
  }

  sparkle(x: number, y: number, n: number, colors = ["#fff6a8", "#ffd23f", "#ffffff"]) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(60, 260);
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 120, life: 0, max: rand(0.4, 0.9), size: Math.round(rand(2, 5)), color: colors[i % colors.length] });
    }
  }

  fly(img: HTMLImageElement, from: { x: number; y: number }, to: { x: number; y: number }, n: number, onArrive?: () => void) {
    for (let i = 0; i < n; i++) {
      const x0 = from.x + rand(-20, 20);
      const y0 = from.y + rand(-20, 20);
      this.flyers.push({
        img,
        x0,
        y0,
        x1: to.x,
        y1: to.y,
        cx: (x0 + to.x) / 2 + rand(-160, 160),
        cy: Math.min(y0, to.y) - rand(40, 200),
        t: 0,
        delay: i * 0.035,
        dur: rand(0.55, 0.85),
        size: 22,
        onArrive,
      });
    }
  }

  private frame = (t: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const ctx = this.ctx;
    if (!ctx || !this.canvas) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = false;

    this.parts = this.parts.filter((p) => {
      p.life += dt;
      if (p.life >= p.max) return false;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.g < 100) p.vx = Math.sin((p.life + p.size) * 3) * 40;
      ctx.globalAlpha = Math.min(1, 2.5 * (1 - p.life / p.max));
      ctx.fillStyle = "#2a160b";
      ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, p.size + 2, p.size + 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      return true;
    });

    this.flyers = this.flyers.filter((f) => {
      f.t += dt;
      const k = (f.t - f.delay) / f.dur;
      if (k < 0) return true;
      if (k >= 1) {
        f.onArrive?.();
        return false;
      }
      const e = k * k * (3 - 2 * k);
      const x = (1 - e) * (1 - e) * f.x0 + 2 * (1 - e) * e * f.cx + e * e * f.x1;
      const y = (1 - e) * (1 - e) * f.y0 + 2 * (1 - e) * e * f.cy + e * e * f.y1;
      ctx.globalAlpha = 1;
      const s = f.size * (1 - 0.3 * e);
      ctx.drawImage(f.img, Math.round(x - s / 2), Math.round(y - s / 2), s, s);
      return true;
    });

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    this.texts = this.texts.filter((tx) => {
      tx.life += dt;
      if (tx.life >= tx.max) return false;
      const k = tx.life / tx.max;
      tx.y += tx.vy * dt;
      tx.vy *= 0.97;
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.6 : k < 0.22 ? 1.2 - ((k - 0.12) / 0.1) * 0.2 : 1;
      const size = Math.round(tx.size * pop);
      ctx.font = `700 ${size}px ${this.font}`;
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      const x = Math.round(tx.x + Math.sin(tx.wobble + k * 6) * 3);
      const y = Math.round(tx.y);
      ctx.lineWidth = Math.max(3, size / 5);
      ctx.strokeStyle = "#2a160b";
      ctx.strokeText(tx.text, x, y);
      ctx.fillStyle = tx.color === "rainbow" ? `hsl(${(tx.life * 600) % 360} 95% 65%)` : tx.color;
      ctx.fillText(tx.text, x, y);
      return true;
    });
    ctx.globalAlpha = 1;
  };
}
