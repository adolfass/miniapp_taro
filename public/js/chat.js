/**
 * Chat Module
 * Чат с тарологом с таймером и WebSocket
 */

import { switchScreen, tg } from './main.js';

// ========================================
// Состояние
// ========================================
let socket = null;
let currentSession = null;
let currentTarologist = null;
let timerInterval = null;
let timeLeft = 1500; // 25 минут в секундах
let selectedRating = 0;
let isConnected = false;

// ========================================
// DOM Элементы
// ========================================
const screenChat = document.getElementById('screen-chat');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');
const chatInputContainer = document.getElementById('chat-input-container');
const chatTimeoutMessage = document.getElementById('chat-timeout-message');
const chatTarologistAvatar = document.getElementById('chat-tarologist-avatar');
const chatTarologistName = document.getElementById('chat-tarologist-name');
const chatStatus = document.getElementById('chat-status');
const timerValue = document.getElementById('timer-value');
const chatTimer = document.getElementById('chat-timer');

// Экран оценки
const screenRating = document.getElementById('screen-rating');
const starsRating = document.getElementById('stars-rating');
const selectedRatingText = document.getElementById('selected-rating-text');
const submitRatingBtn = document.getElementById('submit-rating-btn');
const backToMainRatingBtn = document.getElementById('back-to-main-rating-btn');

// ========================================
// Инициализация
// ========================================
export function initChat(tarologist, transactionId) {
  currentTarologist = tarologist;
  currentSession = { id: transactionId };
  
  setupChatUI();
  connectWebSocket();
  setupRatingListeners();
}

function setupChatUI() {
  // Устанавливаем информацию о тарологе
  chatTarologistAvatar.src = currentTarologist.photo_url;
  chatTarologistAvatar.alt = currentTarologist.name;
  chatTarologistName.textContent = currentTarologist.name;
  
  // Очищаем сообщения
  chatMessages.innerHTML = '';
  
  // Сбрасываем состояние
  chatInputContainer.style.display = 'flex';
  chatTimeoutMessage.style.display = 'none';
  chatInput.value = '';
  
  // Запускаем таймер
  startTimer();
  
  // Приветственное сообщение
  addSystemMessage(`Консультация началась. Длительность: 25 минут.`);
  
  // Добавляем данные расклада (если есть)
  const spreadData = getCurrentSpreadData();
  if (spreadData) {
    addSystemMessage(`Расклад: ${spreadData.type}`);
  }
}

function getCurrentSpreadData() {
  // Получаем данные текущего расклада из main.js
  if (window.tarotState) {
    return {
      type: window.tarotState.currentSpread,
      cards: window.tarotState.cards
    };
  }
  return null;
}

// ========================================
// WebSocket подключение
// ========================================
function connectWebSocket() {
  const wsUrl = import.meta.env.DEV 
    ? 'ws://localhost:3001' 
    : `wss://${window.location.host}`;
  
  socket = new WebSocket(wsUrl);
  
  socket.onopen = () => {
    console.log('WebSocket подключён');
    isConnected = true;
    chatStatus.textContent = 'онлайн';
    chatStatus.style.color = 'var(--gold)';
    
    // Подписываемся на сессию
    socket.send(JSON.stringify({
      type: 'join-session',
      sessionId: currentSession.id,
      userId: tg.initDataUnsafe?.user?.id || 'mock_user',
      userType: 'client'
    }));
  };
  
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleWebSocketMessage(data);
  };
  
  socket.onclose = () => {
    console.log('WebSocket отключён');
    isConnected = false;
    chatStatus.textContent = 'офлайн';
    chatStatus.style.color = 'var(--text-secondary)';
  };
  
  socket.onerror = (error) => {
    console.error('WebSocket ошибка:', error);
  };
}

function handleWebSocketMessage(data) {
  switch (data.type || 'message') {
    case 'messages-history':
      renderMessageHistory(data.messages || data);
      break;
      
    case 'new-message':
      addMessage(data.text, data.senderType, data.timestamp);
      break;
      
    case 'session-expired':
      handleSessionExpired();
      break;
      
    case 'time-left':
      if (data.timeLeft !== undefined) {
        timeLeft = Math.floor(data.timeLeft);
        updateTimerDisplay();
      }
      break;
      
    case 'error':
      addSystemMessage(`Ошибка: ${data.message}`);
      break;
  }
}

// ========================================
// Таймер
// ========================================
function startTimer() {
  timeLeft = 1500; // 25 минут
  updateTimerDisplay();
  
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    
    // Предупреждение за 1 минуту
    if (timeLeft === 60) {
      addSystemMessage('⏰ Осталась 1 минута консультации');
      chatTimer.classList.add('urgent');
    }
    
    // Предупреждение за 10 секунд
    if (timeLeft <= 10 && timeLeft > 0) {
      chatTimer.classList.add('urgent');
    }
    
    // Время вышло
    if (timeLeft <= 0) {
      handleSessionExpired();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  timerValue.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  chatTimer.classList.remove('urgent');
}

// ========================================
// Сообщения
// ========================================
function renderMessageHistory(messages) {
  chatMessages.innerHTML = '';
  
  if (!messages || messages.length === 0) {
    addSystemMessage('Начните чат с тарологом. Опишите ваш вопрос.');
    return;
  }
  
  messages.forEach(msg => {
    addMessage(msg.text, msg.sender_type || msg.senderType, msg.timestamp);
  });
  
  scrollToBottom();
}

function addMessage(text, senderType, timestamp = null) {
  const messageEl = document.createElement('div');
  messageEl.className = `chat-message ${senderType}`;
  
  const timeStr = timestamp 
    ? formatMessageTime(new Date(timestamp))
    : formatMessageTime(new Date());
  
  messageEl.innerHTML = `
    <div class="message-text">${escapeHtml(text)}</div>
    <div class="message-time">${timeStr}</div>
  `;
  
  chatMessages.appendChild(messageEl);
  scrollToBottom();
}

function addSystemMessage(text) {
  const messageEl = document.createElement('div');
  messageEl.className = 'chat-message system';
  messageEl.style.cssText = `
    align-self: center;
    background: rgba(212, 175, 55, 0.1);
    border: 1px solid rgba(212, 175, 55, 0.2);
    font-size: 12px;
    font-style: italic;
    text-align: center;
    max-width: 90%;
  `;
  messageEl.textContent = text;
  chatMessages.appendChild(messageEl);
  scrollToBottom();
}

function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || !isConnected) return;
  
  socket.send(JSON.stringify({
    type: 'send-message',
    sessionId: currentSession.id,
    text: text,
    senderId: tg.initDataUnsafe?.user?.id || 'mock_user',
    senderType: 'client'
  }));
  
  chatInput.value = '';
  scrollToBottom();
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function formatMessageTime(date) {
  return date.toLocaleTimeString('ru-RU', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ========================================
// Завершение сессии
// ========================================
function handleSessionExpired() {
  stopTimer();
  
  chatInputContainer.style.display = 'none';
  chatTimeoutMessage.style.display = 'block';
  
  addSystemMessage('⏰ Время консультации вышло');
  
  // Через 3 секунды переходим к оценке
  setTimeout(() => {
    showRatingScreen();
  }, 3000);
}

function showRatingScreen() {
  switchScreen('rating');
  resetRating();
}

// ========================================
// Оценка таролога
// ========================================
function setupRatingListeners() {
  // Выбор звёзд
  const starBtns = starsRating.querySelectorAll('.star-btn');
  
  starBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const rating = parseInt(btn.dataset.rating);
      selectRating(rating);
    });
    
    btn.addEventListener('mouseenter', () => {
      const rating = parseInt(btn.dataset.rating);
      highlightStars(rating);
    });
  });
  
  starsRating.addEventListener('mouseleave', () => {
    highlightStars(selectedRating);
  });
  
  // Отправка оценки
  submitRatingBtn?.addEventListener('click', submitRating);
  
  // Возврат к раскладам
  backToMainRatingBtn?.addEventListener('click', () => {
    switchScreen('main');
  });
}

function selectRating(rating) {
  selectedRating = rating;
  highlightStars(rating);
  
  // Обновляем текст
  const ratingTexts = ['', 'Ужасно', 'Плохо', 'Нормально', 'Хорошо', 'Отлично'];
  selectedRatingText.textContent = ratingTexts[rating];
  
  // Активируем кнопку
  submitRatingBtn.disabled = false;
}

function highlightStars(rating) {
  const starBtns = starsRating.querySelectorAll('.star-btn');
  
  starBtns.forEach((btn, index) => {
    if (index < rating) {
      btn.textContent = '★';
      btn.classList.add('filled');
    } else {
      btn.textContent = '☆';
      btn.classList.remove('filled');
    }
  });
}

function resetRating() {
  selectedRating = 0;
  highlightStars(0);
  selectedRatingText.textContent = '';
  submitRatingBtn.disabled = true;
  backToMainRatingBtn.style.display = 'none';
}

async function submitRating() {
  if (selectedRating < 1) return;
  
  try {
    if (import.meta.env.DEV) {
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log(`Оценка отправлена: ${selectedRating}`);
    } else {
      await fetch('/api/rate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tarologistId: currentTarologist.id,
          userId: tg.initDataUnsafe?.user?.id,
          rating: selectedRating,
          sessionId: currentSession.id
        })
      });
    }
    
    // Показываем благодарность
    selectedRatingText.textContent = 'Спасибо за оценку!';
    submitRatingBtn.style.display = 'none';
    backToMainRatingBtn.style.display = 'block';
    
    // Закрываем WebSocket
    if (socket) {
      socket.close();
    }
    
  } catch (error) {
    console.error('Ошибка отправки оценки:', error);
    tg.showAlert('Не удалось отправить оценку. Попробуйте позже.');
  }
}

// ========================================
// Обработчики событий
// ========================================
chatSendBtn?.addEventListener('click', sendMessage);

chatInput?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendMessage();
  }
});

// ========================================
// Экспорт уже объявлен inline (initChat)
// ========================================
