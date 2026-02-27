/**
 * Tarologists Module
 * Экран выбора таролога и оплата консультации
 */

import { switchScreen, tg, currentSpread, getCurrentResult, timerInterval } from './main.js';

// ========================================
// Состояние
// ========================================
let tarologists = [];
let selectedTarologist = null;
let currentTransaction = null;

// ========================================
// DOM Элементы
// ========================================
const screenTarologists = document.getElementById('screen-tarologists');
const tarologistsList = document.getElementById('tarologists-list');
const tarologistsLoading = document.getElementById('tarologists-loading');
const paymentModal = document.getElementById('payment-modal');
const paymentCancelBtn = document.getElementById('payment-cancel-btn');
const paymentConfirmBtn = document.getElementById('payment-confirm-btn');
const paymentTarologistName = document.getElementById('payment-tarologist-name');
const paymentStarsAmount = document.getElementById('payment-stars-amount');
const paymentSuccessModal = document.getElementById('payment-success-modal');
const startChatBtn = document.getElementById('start-chat-btn');
const backToSpreadsTarologists = document.getElementById('back-to-spreads-tarologists');

// ========================================
// Инициализация
// ========================================
export function initTarologists() {
  setupEventListeners();
}

function setupEventListeners() {
  // Кнопка "Поделиться с тарологом" из ежедневного расклада
  document.getElementById('daily-share-btn')?.addEventListener('click', openTarologistsScreen);
  
  // Кнопка "Поделиться с тарологом" из расклада на ситуацию
  document.getElementById('situation-share-btn')?.addEventListener('click', openTarologistsScreen);
  
  // Назад к раскладам
  backToSpreadsTarologists?.addEventListener('click', () => {
    if (currentSpread === 'daily') {
      switchScreen('daily');
    } else {
      switchScreen('situation');
    }
  });
  
  // Отмена оплаты
  paymentCancelBtn?.addEventListener('click', closePaymentModal);
  
  // Подтверждение оплаты
  paymentConfirmBtn?.addEventListener('click', confirmPayment);
  
  // Начало чата после успешной оплаты
  startChatBtn?.addEventListener('click', () => {
    paymentSuccessModal.classList.remove('active');
    startChatSession();
  });
  
  // Закрытие модальных окон по клику вне
  paymentModal?.addEventListener('click', (e) => {
    if (e.target === paymentModal) closePaymentModal();
  });
  
  paymentSuccessModal?.addEventListener('click', (e) => {
    if (e.target === paymentSuccessModal) {
      paymentSuccessModal.classList.remove('active');
    }
  });
}

// ========================================
// Экран выбора таролога
// ========================================
export async function openTarologistsScreen() {
  switchScreen('tarologists');
  await loadTarologists();
}

async function loadTarologists() {
  tarologistsList.style.display = 'none';
  tarologistsLoading.classList.add('active');
  
  try {
    // Для локальной разработки используем мок-данные
    if (import.meta.env.DEV) {
      await new Promise(resolve => setTimeout(resolve, 500));
      tarologists = getMockTarologists();
    } else {
      const response = await fetch('/api/tarologists');
      const data = await response.json();
      
      if (!data.success) {
        throw new Error('Failed to load tarologists');
      }
      
      tarologists = data.data;
    }
    
    renderTarologists();
  } catch (error) {
    console.error('Ошибка загрузки тарологов:', error);
    tarologistsList.innerHTML = `
      <p style="color: var(--text-secondary); text-align: center;">
        Не удалось загрузить тарологов. Попробуйте позже.
      </p>
    `;
    tarologistsList.style.display = 'block';
  } finally {
    tarologistsLoading.classList.remove('active');
  }
}

function renderTarologists() {
  tarologistsList.innerHTML = '';
  
  tarologists.forEach(tarologist => {
    const card = createTarologistCard(tarologist);
    tarologistsList.appendChild(card);
  });
  
  tarologistsList.style.display = 'flex';
}

function createTarologistCard(tarologist) {
  const card = document.createElement('div');
  card.className = 'tarologist-card';
  card.dataset.id = tarologist.id;
  
  const starsRating = renderStarsRating(tarologist.rating);
  
  card.innerHTML = `
    <img src="${tarologist.photo_url}" alt="${tarologist.name}" class="tarologist-avatar">
    <div class="tarologist-info">
      <div class="tarologist-name">${tarologist.name}</div>
      <div class="tarologist-description">${tarologist.description}</div>
      <div class="tarologist-meta">
        <div class="tarologist-rating">
          <span class="tarologist-stars">${starsRating}</span>
          <span class="tarologist-rating-value">(${tarologist.total_ratings})</span>
        </div>
        <div class="tarologist-price">
          <span>${tarologist.price}</span>
          <span>⭐</span>
        </div>
        <span class="tarologist-level">Ур. ${tarologist.level}</span>
      </div>
    </div>
    <button class="tarologist-select-btn">Выбрать</button>
  `;
  
  // Клик по карточке
  card.addEventListener('click', (e) => {
    if (!e.target.classList.contains('tarologist-select-btn')) {
      selectTarologist(tarologist);
    }
  });
  
  // Кнопка "Выбрать"
  card.querySelector('.tarologist-select-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    selectTarologist(tarologist);
    setTimeout(() => openPaymentModal(tarologist), 200);
  });
  
  return card;
}

function renderStarsRating(rating) {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  let stars = '';
  
  for (let i = 0; i < 5; i++) {
    if (i < fullStars) {
      stars += '★';
    } else if (i === fullStars && hasHalfStar) {
      stars += '★';
    } else {
      stars += '☆';
    }
  }
  
  return stars;
}

function selectTarologist(tarologist) {
  selectedTarologist = tarologist;
  
  // Убираем выделение с других карточек
  document.querySelectorAll('.tarologist-card').forEach(card => {
    card.classList.remove('selected');
  });
  
  // Выделяем выбранную
  const selectedCard = document.querySelector(`.tarologist-card[data-id="${tarologist.id}"]`);
  if (selectedCard) {
    selectedCard.classList.add('selected');
  }
}

// ========================================
// Модальное окно оплаты
// ========================================
function openPaymentModal(tarologist) {
  paymentTarologistName.textContent = tarologist.name;
  paymentStarsAmount.textContent = `${tarologist.price} ⭐`;
  paymentModal.classList.add('active');
}

function closePaymentModal() {
  paymentModal.classList.remove('active');
}

async function confirmPayment() {
  if (!selectedTarologist) return;
  
  // Получаем данные расклада для передачи тарологу
  const spreadData = getCurrentResult();
  
  try {
    // Для локальной разработки имитируем оплату
    if (import.meta.env.DEV) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      currentTransaction = {
        id: Date.now(),
        tarologistId: selectedTarologist.id,
        starsAmount: selectedTarologist.price
      };
      
      closePaymentModal();
      showPaymentSuccess();
      return;
    }
    
    // Получаем initData из Telegram
    const initData = tg.initData;
    
    // Создаём инвойс
    const response = await fetch('/api/create-invoice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tarologistId: selectedTarologist.id,
        initData
      })
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to create invoice');
    }
    
    currentTransaction = {
      id: data.data.transactionId,
      starsAmount: data.data.starsAmount
    };
    
    // Открываем инвойс Telegram
    tg.openInvoice(data.data.invoiceLink, async (status) => {
      if (status === 'paid') {
        showPaymentSuccess();
      } else if (status === 'cancelled' || status === 'failed') {
        tg.showAlert('Оплата не была завершена. Попробуйте снова.');
      }
    });
    
    closePaymentModal();
  } catch (error) {
    console.error('Ошибка оплаты:', error);
    tg.showAlert('Произошла ошибка при оплате. Попробуйте позже.');
  }
}

function showPaymentSuccess() {
  paymentSuccessModal.classList.add('active');
}

// ========================================
// Чат сессия
// ========================================
function startChatSession() {
  if (!selectedTarologist || !currentTransaction) return;
  
  // Переключаемся на экран чата
  switchScreen('chat');
  
  // Инициализируем чат
  const chatModule = import('./chat.js');
  chatModule.then(module => {
    module.initChat(selectedTarologist, currentTransaction.id);
  });
}

// ========================================
// Mock данные для разработки
// ========================================
function getMockTarologists() {
  return [
    {
      id: 1,
      name: 'Александра',
      photo_url: 'https://via.placeholder.com/200x200/8B5CF6/FFFFFF?text=A',
      description: 'Профессиональный таролог с 5-летним опытом. Специализируюсь на отношениях и карьере.',
      rating: 4.8,
      total_ratings: 127,
      sessions_completed: 45,
      level: 5,
      price: 48
    },
    {
      id: 2,
      name: 'Михаил',
      photo_url: 'https://via.placeholder.com/200x200/6366F1/FFFFFF?text=M',
      description: 'Эксперт по картам Таро и астрологии. Помогу найти верный путь в сложной ситуации.',
      rating: 4.6,
      total_ratings: 89,
      sessions_completed: 23,
      level: 3,
      price: 40
    },
    {
      id: 3,
      name: 'Елена',
      photo_url: 'https://via.placeholder.com/200x200/EC4899/FFFFFF?text=E',
      description: 'Потомственная гадалка. Работаю с Таро более 10 лет. Расклады на любую тематику.',
      rating: 4.9,
      total_ratings: 256,
      sessions_completed: 156,
      level: 16,
      price: 148
    }
  ];
}

// ========================================
// Экспорт
// ========================================
export { openTarologistsScreen, openPaymentModal };
