/**
 * Animations Module
 * Анимации звёздного фона и частиц при перевороте карт
 */

let starsAnimationId = null;
let particlesCanvas = null;
let particlesCtx = null;
let particles = [];
let particlesAnimationId = null;

export function initStars() {
  const canvas = document.getElementById('stars-canvas');
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const stars = [];
  const numStars = Math.floor((canvas.width * canvas.height) / 4000);

  for (let i = 0; i < numStars; i++) {
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 2 + 0.5,
      opacity: Math.random() * 0.5 + 0.3,
      speed: Math.random() * 0.02 + 0.01,
      phase: Math.random() * Math.PI * 2
    });
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    stars.forEach(star => {
      star.phase += star.speed;
      star.opacity = 0.3 + 0.5 * Math.sin(star.phase);

      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
      ctx.fill();
    });

    starsAnimationId = requestAnimationFrame(animate);
  }

  animate();
}

class Particle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 8;
    this.vy = (Math.random() - 0.5) * 8;
    this.life = 1;
    this.decay = Math.random() * 0.02 + 0.02;
    this.size = Math.random() * 4 + 2;
    this.color = `hsl(${45 + Math.random() * 15}, 80%, ${60 + Math.random() * 20}%)`;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.1;
    this.life -= this.decay;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.life;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();
  }
}

export function createParticles(x, y, count = 20) {
  if (!particlesCanvas) {
    particlesCanvas = document.getElementById('particles-canvas');
    particlesCtx = particlesCanvas.getContext('2d');
    particlesCanvas.width = window.innerWidth;
    particlesCanvas.height = window.innerHeight;

    window.addEventListener('resize', () => {
      particlesCanvas.width = window.innerWidth;
      particlesCanvas.height = window.innerHeight;
    });
  }

  for (let i = 0; i < count; i++) {
    particles.push(new Particle(x, y));
  }

  if (!particlesAnimationId) {
    animateParticles();
  }
}

function animateParticles() {
  particlesCtx.clearRect(0, 0, particlesCanvas.width, particlesCanvas.height);

  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    particles[i].draw(particlesCtx);

    if (particles[i].life <= 0) {
      particles.splice(i, 1);
    }
  }

  if (particles.length > 0) {
    particlesAnimationId = requestAnimationFrame(animateParticles);
  } else {
    particlesAnimationId = null;
  }
}
