/**
 * Sound Module
 * Управление звуковыми эффектами (тасовка карт)
 */

let shuffleAudio = null;
let isInitialized = false;
let isPlaying = false;

function initSound() {
  if (isInitialized) return;

  shuffleAudio = new Audio('assets/sounds/shuffle.mp3');
  shuffleAudio.preload = 'auto';
  shuffleAudio.load();
  
  // Обработка ошибок загрузки
  shuffleAudio.addEventListener('error', (e) => {
    console.warn('Не удалось загрузить звук тасовки:', e);
  });
  
  // Обработка окончания воспроизведения
  shuffleAudio.addEventListener('ended', () => {
    isPlaying = false;
  });

  isInitialized = true;
}

// Предзагрузка звука при первом взаимодействии
function warmupAudio() {
  if (!isInitialized) {
    initSound();
  }
  
  // На мобильных устройствах нужно "разогреть" аудио контекст
  if (shuffleAudio) {
    shuffleAudio.play().then(() => {
      shuffleAudio.pause();
      shuffleAudio.currentTime = 0;
    }).catch(() => {
      // Игнорируем ошибку - это только "разогрев"
    });
  }
}

export function playShuffleSound() {
  if (!isInitialized) initSound();

  if (shuffleAudio && !isPlaying) {
    isPlaying = true;
    shuffleAudio.currentTime = 0;
    
    // На мобильных устройствах увеличиваем громкость
    shuffleAudio.volume = 1.0;
    
    const playPromise = shuffleAudio.play();
    
    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        console.warn('Воспроизведение звука заблокировано:', error);
        isPlaying = false;
      });
    }
  }
}

// Экспорт функции для "разогрева" аудио
export { warmupAudio };
