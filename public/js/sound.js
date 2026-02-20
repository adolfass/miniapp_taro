/**
 * Sound Module
 * Управление звуковыми эффектами (тасовка карт)
 */

let shuffleAudio = null;
let isInitialized = false;

function initSound() {
  if (isInitialized) return;

  shuffleAudio = new Audio('assets/sounds/shuffle.mp3');
  shuffleAudio.preload = 'auto';
  shuffleAudio.addEventListener('error', (e) => {
    console.warn('Не удалось загрузить звук тасовки:', e);
  });

  isInitialized = true;
}

export function playShuffleSound() {
  if (!isInitialized) initSound();

  if (shuffleAudio) {
    shuffleAudio.currentTime = 0;
    shuffleAudio.play().catch((error) => {
      console.warn('Воспроизведение звука заблокировано:', error);
    });
  }
}
