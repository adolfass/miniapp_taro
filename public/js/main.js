/**
 * Tarot Mini App — Main Entry Point
 * Точка входа приложения, инициализация Telegram WebApp
 */

import { initStars, createParticles } from './animations.js';
import { playShuffleSound, warmupAudio } from './sound.js';
import { initShake, stopShake } from './shake.js';
import { getRandomCards } from './cards.js';
import { getDailyPosition, formatDailySpreadText } from './spreads.js';
import { getDescriptionHTML } from './description.js';

// ========================================
// Telegram WebApp Mock для разработки
// ========================================
if (import.meta.env.DEV) {
  window.Telegram = {
    WebApp: {
      initData: 'user=test',
      initDataUnsafe: { user: { id: 123, first_name: 'Test' } },
      colorScheme: 'dark',
      themeParams: {},
      expand: () => {},
      ready: () => {},
      showAlert: (msg) => alert(msg),
      showConfirm: (msg, callback) => callback(confirm(msg)),
      HapticFeedback: {
        impactOccurred: () => {},
        notificationOccurred: () => {}
      },
      Clipboard: {
        writeText: (text, callback) => {
          navigator.clipboard.writeText(text).then(() => callback(true));
        }
      },
      sendData: (data) => console.log('sendData:', data)
    }
  };
}

const tg = window.Telegram.WebApp;

// ========================================
// Состояние приложения
// ========================================
const state = {
  soundEnabled: true,
  dailyCards: [],
  situationCards: [],
  dailyRevealed: [false, false, false],
  situationRevealed: Array(7).fill(false)
};

// ========================================
// DOM Элементы
// ========================================
const screens = {
  main: document.getElementById('screen-main'),
  spreads: document.getElementById('screen-spreads'),
  daily: document.getElementById('screen-daily'),
  concentration: document.getElementById('screen-concentration'),
  activation: document.getElementById('screen-activation'),
  situation: document.getElementById('screen-situation')
};

const deckContainer = document.getElementById('deck-container');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsClose = document.getElementById('settings-close');
const soundToggle = document.getElementById('sound-toggle');
const descriptionModal = document.getElementById('description-modal');
const descriptionBody = document.getElementById('description-body');
const descriptionClose = document.getElementById('description-close');

// ========================================
// Навигация
// ========================================
function switchScreen(screenName) {
  Object.values(screens).forEach(screen => screen.classList.remove('active'));
  screens[screenName].classList.add('active');
  
  // Сброс таймера и состояния тасовки при возврате на главный
  if (screenName === 'main') {
    if (shuffleTimer) {
      clearInterval(shuffleTimer);
      shuffleTimer = null;
    }
    isShuffling = false;
    
    // Возвращаем подсказку
    const shuffleHint = document.getElementById('shuffle-hint');
    const shuffleTimerEl = document.getElementById('shuffle-timer');
    if (shuffleHint) shuffleHint.style.display = 'block';
    if (shuffleTimerEl) shuffleTimerEl.style.display = 'none';
  }
}

// ========================================
// Инициализация
// ========================================
function init() {
  // Инициализация Telegram WebApp
  tg.ready();
  tg.expand();
  
  console.log('Telegram WebApp инициализирован');
  console.log('tg:', tg);
  console.log('tg.HapticFeedback:', tg.HapticFeedback);

  // Инициализация звёздного фона
  initStars();

  // Загрузка настроек
  const savedSound = localStorage.getItem('tarot-sound');
  if (savedSound !== null) {
    state.soundEnabled = savedSound === 'true';
    soundToggle.checked = state.soundEnabled;
  }

  // "Разогрев" аудио при первом взаимодействии (для мобильных)
  document.addEventListener('click', warmupAudio, { once: true });
  document.addEventListener('touchstart', warmupAudio, { once: true });

  // Обработчики событий
  setupEventListeners();

  console.log('Tarot Mini App initialized');
}

// ========================================
// Обработчики событий
// ========================================
function setupEventListeners() {
  // Колода — тасовка
  deckContainer.addEventListener('click', handleDeckClick);
  
  // Настройки
  settingsBtn.addEventListener('click', () => settingsModal.classList.add('active'));
  settingsClose.addEventListener('click', () => settingsModal.classList.remove('active'));
  soundToggle.addEventListener('change', (e) => {
    state.soundEnabled = e.target.checked;
    localStorage.setItem('tarot-sound', state.soundEnabled);
  });

  // Кнопки выбора расклада
  document.getElementById('daily-spread-btn').addEventListener('click', startDailySpread);
  document.getElementById('situation-spread-btn').addEventListener('click', startSituationSpread);

  // Кнопки «Назад»
  document.getElementById('back-to-main-1').addEventListener('click', () => switchScreen('main'));
  document.getElementById('back-to-spreads-1').addEventListener('click', () => switchScreen('spreads'));
  document.getElementById('back-to-spreads-2').addEventListener('click', () => switchScreen('spreads'));
  document.getElementById('back-to-spreads-3').addEventListener('click', () => switchScreen('spreads'));

  // Описание расклада
  document.getElementById('description-btn').addEventListener('click', openDescription);
  document.getElementById('description-btn-2').addEventListener('click', openDescription);
  descriptionClose.addEventListener('click', closeDescription);
  
  // Закрытие модального окна по клику вне
  descriptionModal.addEventListener('click', (e) => {
    if (e.target === descriptionModal) {
      closeDescription();
    }
  });
  
  // Расклад на ситуацию — активация
  document.getElementById('activate-btn').addEventListener('click', performSituationSpread);
  
  // Ежедневный расклад — действия
  document.getElementById('daily-share-btn').addEventListener('click', shareDailyResult);
  document.getElementById('daily-new-btn').addEventListener('click', () => switchScreen('spreads'));
  
  // Расклад на ситуацию — действия
  document.getElementById('situation-share-btn').addEventListener('click', shareSituationResult);
  document.getElementById('situation-new-btn').addEventListener('click', () => switchScreen('spreads'));
  
  // Закрытие модального окна настроек по клику вне
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.remove('active');
    }
  });
}

// ========================================
// Описание расклада
// ========================================
function openDescription() {
  descriptionBody.innerHTML = getDescriptionHTML();
  descriptionModal.classList.add('active');
}

function closeDescription() {
  descriptionModal.classList.remove('active');
}

// ========================================
// Обработчики колоды
// ========================================
let shuffleTimer = null;
let isShuffling = false;

function handleDeckClick() {
  if (isShuffling) return;
  
  isShuffling = true;
  const deckContainer = document.getElementById('deck-container');
  const shuffleHint = document.getElementById('shuffle-hint');
  const shuffleTimerEl = document.getElementById('shuffle-timer');

  console.log('Тасовка началась, звук включён:', state.soundEnabled);
  console.log('Telegram WebApp:', tg);
  console.log('HapticFeedback:', tg.HapticFeedback);

  // Воспроизведение звука
  if (state.soundEnabled) {
    playShuffleSound();
    console.log('Звук тасовки воспроизводится');
  }

  // Скрываем подсказку, показываем таймер
  if (shuffleHint) shuffleHint.style.display = 'none';
  if (shuffleTimerEl) {
    shuffleTimerEl.style.display = 'block';
  }

  // Тактильный отклик при начале тасовки (лёгкая вибрация)
  if (tg.HapticFeedback) {
    tg.HapticFeedback.impactOccurred('light');
    console.log('Вибрация отправлена (light impact - начало)');
  }

  // Запускаем таймер на 6 секунд
  let timeLeft = 6;
  if (shuffleTimerEl) shuffleTimerEl.textContent = timeLeft;

  shuffleTimer = setInterval(() => {
    timeLeft--;
    if (shuffleTimerEl) shuffleTimerEl.textContent = timeLeft;

    if (timeLeft <= 0) {
      clearInterval(shuffleTimer);
      
      // Скрываем таймер
      if (shuffleTimerEl) shuffleTimerEl.style.display = 'none';
      
      // Тактильный отклик - готово! (средняя длительность)
      if (tg.HapticFeedback) {
        // Используем impactOccurred с 'medium' для средней вибрации
        tg.HapticFeedback.impactOccurred('medium');
        console.log('Вибрация отправлена (medium impact)');
      } else {
        console.log('HapticFeedback недоступен');
      }
      
      // Переходим к выбору расклада
      deckContainer.classList.remove('shuffling');
      isShuffling = false;
      switchScreen('spreads');
    }
  }, 1000);
}

// ========================================
// Ежедневный расклад
// ========================================
function startDailySpread() {
  state.dailyCards = getRandomCards(3);
  state.dailyRevealed = [false, false, false];
  
  const container = document.getElementById('daily-cards');
  container.innerHTML = '';
  
  state.dailyCards.forEach((card, index) => {
    const position = getDailyPosition(index);
    const cardEl = createCardElement(card, index, 'daily', position.name);
    container.appendChild(cardEl);
  });
  
  document.getElementById('daily-actions').style.display = 'none';
  switchScreen('daily');
}

function revealDailyCard(index) {
  if (state.dailyRevealed[index]) return;

  state.dailyRevealed[index] = true;

  const cardEl = document.querySelector(`#daily-cards .card:nth-child(${index + 1})`);
  cardEl.classList.add('flipped', 'revealed');

  // Тактильный отклик
  if (tg.HapticFeedback) {
    tg.HapticFeedback.impactOccurred('light');
  }

  // Частицы появляются в середине анимации переворота (350ms)
  setTimeout(() => {
    const rect = cardEl.getBoundingClientRect();
    createParticles(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, 350);

  // Проверка завершения
  if (state.dailyRevealed.every(r => r)) {
    document.getElementById('daily-actions').style.display = 'flex';
  }
}

function shareDailyResult() {
  const text = formatDailyResult();
  
  if (tg.Clipboard) {
    tg.Clipboard.writeText(text, (success) => {
      if (success) {
        tg.showAlert('Результат скопирован в буфер обмена!');
      }
    });
  } else {
    navigator.clipboard.writeText(text).then(() => {
      tg.showAlert('Результат скопирован в буфер обмена!');
    });
  }
}

function formatDailyResult() {
  return formatDailySpreadText(state.dailyCards);
}

// ========================================
// Расклад на ситуацию
// ========================================
let concentrationTimer = null;

function startSituationSpread() {
  switchScreen('concentration');
  startConcentrationTimer();
}

function startConcentrationTimer() {
  const timerText = document.getElementById('timer-text');
  const hourglass = document.getElementById('hourglass');
  
  // Перезапуск анимации песочных часов
  hourglass.style.animation = 'none';
  hourglass.offsetHeight; // trigger reflow
  hourglass.style.animation = 'flip-hourglass 7s linear forwards';
  
  let timeLeft = 7;
  timerText.textContent = timeLeft;

  concentrationTimer = setInterval(() => {
    timeLeft--;
    timerText.textContent = timeLeft;

    if (timeLeft <= 0) {
      clearInterval(concentrationTimer);
      switchScreen('activation');
      initShake(performSituationSpread);
    }
  }, 1000);
}

function performSituationSpread() {
  stopShake();

  const rawCards = getRandomCards(7);
  state.situationCards = rawCards;
  state.situationRevealed = Array(7).fill(false);

  // Позиции для расклада на ситуацию
  const positions = [
    { index: 0, name: 'Суть вопроса' },
    { index: 1, name: 'Прошлое ментальный' },
    { index: 2, name: 'Прошлое астральный' },
    { index: 3, name: 'Прошлое физический' },
    { index: 4, name: 'Будущее физический' },
    { index: 5, name: 'Будущее астральный' },
    { index: 6, name: 'Будущее ментальный' }
  ];

  // Заполняем слоты картами
  positions.forEach((pos) => {
    const slot = document.querySelector(`.situation-card-slot[data-index="${pos.index}"]`);
    if (slot) {
      slot.innerHTML = '';
      const cardEl = createCardElement(rawCards[pos.index], pos.index, 'situation', pos.name);

      // Добавляем подпись позиции
      const label = document.createElement('div');
      label.className = 'situation-position-label';
      label.textContent = pos.name;

      slot.appendChild(cardEl);
      slot.appendChild(label);
    }
  });

  document.getElementById('situation-actions').style.display = 'none';
  switchScreen('situation');
}

function revealSituationCard(index) {
  if (state.situationRevealed[index]) return;

  state.situationRevealed[index] = true;

  const slot = document.querySelector(`.situation-card-slot[data-index="${index}"]`);
  const cardEl = slot ? slot.querySelector('.card') : null;

  if (cardEl) {
    cardEl.classList.add('flipped', 'revealed');
    slot.classList.add('revealed');

    // Тактильный отклик
    if (tg.HapticFeedback) {
      tg.HapticFeedback.impactOccurred('light');
    }

    // Частицы появляются в середине анимации переворота (350ms)
    setTimeout(() => {
      const rect = cardEl.getBoundingClientRect();
      createParticles(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }, 350);
  }

  if (state.situationRevealed.every(r => r)) {
    document.getElementById('situation-actions').style.display = 'flex';
  }
}

function shareSituationResult() {
  const text = formatSituationResult();
  
  if (tg.Clipboard) {
    tg.Clipboard.writeText(text, (success) => {
      if (success) {
        tg.showAlert('Результат скопирован в буфер обмена!');
      }
    });
  } else {
    navigator.clipboard.writeText(text).then(() => {
      tg.showAlert('Результат скопирован в буфер обмена!');
    });
  }
}

function formatSituationResult() {
  // Формируем текст в правильном порядке позиций
  const positions = [
    { index: 0, name: 'Суть вопроса' },
    { index: 1, name: 'Прошлое — ментальный уровень' },
    { index: 2, name: 'Прошлое — астральный уровень' },
    { index: 3, name: 'Прошлое — физический уровень' },
    { index: 4, name: 'Будущее — физический уровень' },
    { index: 5, name: 'Будущее — астральный уровень' },
    { index: 6, name: 'Будущее — ментальный уровень' }
  ];
  
  let text = '🔮 Расклад на ситуацию\n\n';
  
  positions.forEach(pos => {
    const card = state.situationCards[pos.index];
    text += `${pos.name}\n`;
    text += `${card.name_ru}\n`;
    text += `${card.description}\n\n`;
  });
  
  text += '─────────────\n';
  text += 'Этот расклад рекомендовано показать профессиональному\n';
  text += 'тарологу для детальной интерпретации.';
  
  return text;
}

// ========================================
// Создание элемента карты
// ========================================
function createCardElement(card, index, type, positionName = '') {
  const cardEl = document.createElement('div');
  cardEl.className = 'card';
  cardEl.dataset.index = index;
  cardEl.innerHTML = `
    <div class="card-inner">
      <div class="card-face card-front"></div>
      <div class="card-face card-back-face">
        <img src="assets/card-faces/major/${card.id.toString().padStart(2, '0')}-${card.name.toLowerCase().replace(/\s+/g, '-')}.webp" alt="${card.name_ru}" onerror="this.style.display='none'">
      </div>
    </div>
    <div class="card-glow"></div>
    <div class="card-meaning">
      <strong class="level-name">${positionName}</strong>
      <span class="card-name">${card.name_ru}</span>
      <span class="card-description">${card.description}</span>
    </div>
  `;

  cardEl.addEventListener('click', () => {
    if (type === 'daily') {
      revealDailyCard(index);
    } else if (type === 'situation') {
      revealSituationCard(index);
    }
  });
  
  // Двойной клик или клик по раскрытой карте — расширение
  cardEl.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    toggleCardExpand(cardEl);
  });
  
  // Клик по раскрытой карте — расширение (для мобильных)
  cardEl.addEventListener('click', (e) => {
    if (cardEl.classList.contains('revealed')) {
      // Небольшая задержка чтобы не срабатывало при перевороте
      setTimeout(() => {
        toggleCardExpand(cardEl);
      }, 100);
    }
  });

  return cardEl;
}

// ========================================
// Запуск приложения
// ========================================
init();

// ========================================
// Расширение карт при клике
// ========================================
let expandedCard = null;
const cardOverlay = document.getElementById('card-overlay');

// Обработчик для overlay (закрытие по клику вне карты)
if (cardOverlay) {
  cardOverlay.addEventListener('click', closeExpandedCard);
}

function toggleCardExpand(cardEl) {
  if (!cardEl.classList.contains('revealed')) return;
  
  if (cardEl.classList.contains('expanded')) {
    closeExpandedCard();
  } else {
    openExpandedCard(cardEl);
  }
}

function openExpandedCard(cardEl) {
  // Закрываем предыдущую расширенную карту если есть
  if (expandedCard) {
    expandedCard.classList.remove('expanded');
  }
  
  expandedCard = cardEl;
  cardEl.classList.add('expanded');
  
  if (cardOverlay) {
    cardOverlay.classList.add('active');
  }
  
  // Блокируем прокрутку страницы
  document.body.style.overflow = 'hidden';
}

function closeExpandedCard() {
  if (expandedCard) {
    expandedCard.classList.remove('expanded');
    expandedCard = null;
  }
  
  if (cardOverlay) {
    cardOverlay.classList.remove('active');
  }
  
  // Возвращаем прокрутку
  document.body.style.overflow = '';
}

// Закрытие по Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && expandedCard) {
    closeExpandedCard();
  }
});
