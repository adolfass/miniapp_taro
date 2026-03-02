/**
 * Admin Panel Module
 * Админ-панель для управления выплатами и статистикой
 */

import { initStars } from '/js/animations.js';
import { initRefund, openRefundModal } from '/js/refund.js';

// ========================================
// Конфигурация
// ========================================
const API_BASE = '/api/admin';
const ADMIN_TELEGRAM_ID = null; // Будет установлен из Telegram WebApp

// ========================================
// Состояние
// ========================================
let currentStats = null;
let currentTarologists = [];
let currentTransactions = [];
let currentPayouts = [];
let selectedTarologistId = null;
let selectedPayoutId = null;

// ========================================
// DOM Элементы
// ========================================
const screens = {
  dashboard: document.getElementById('screen-dashboard'),
  tarologists: document.getElementById('screen-tarologists-list'),
  transactions: document.getElementById('screen-transactions'),
  payouts: document.getElementById('screen-payouts')
};

const navButtons = {
  tarologists: document.getElementById('tarologists-btn'),
  transactions: document.getElementById('transactions-btn'),
  showPayouts: document.getElementById('show-payouts-btn')
};

const backButtons = {
  tarologists: document.getElementById('back-to-dashboard-tarologists'),
  transactions: document.getElementById('back-to-dashboard-transactions'),
  payouts: document.getElementById('back-to-dashboard-payouts')
};

// Модальные окна
const tarologistModal = document.getElementById('tarologist-modal');
const payoutConfirmModal = document.getElementById('payout-confirm-modal');
const tarologistEditModal = document.getElementById('tarologist-edit-modal');
const refundModal = document.getElementById('refund-modal');

// Элементы формы редактирования
const editModalTitle = document.getElementById('edit-modal-title');
const editTelegramId = document.getElementById('edit-telegram-id');
const editName = document.getElementById('edit-name');
const editDescription = document.getElementById('edit-description');
const editPhotoUrl = document.getElementById('edit-photo-url');

// ========================================
// Инициализация
// ========================================
export async function init() {
  // Инициализация Telegram WebApp
  const tg = window.Telegram?.WebApp;

  if (tg) {
    tg.expand();
    tg.ready();

    // Получаем ID пользователя
    const user = tg.initDataUnsafe?.user;
    if (user) {
      ADMIN_TELEGRAM_ID = user.id;
      console.log('Admin user:', user.first_name, user.id);
    } else {
      // Если нет пользователя - показываем ошибку
      showAlert('Ошибка: не удалось получить данные пользователя');
      return;
    }
  }

  // Инициализация звёздного фона
  initStars();

  // Инициализация refund модуля
  initRefund();

  // Навешиваем обработчики СРАЗУ (до загрузки данных)
  setupEventListeners();
  console.log('✅ Event listeners attached');

  // Загрузка данных (после того как кнопки уже работают)
  loadDashboard().catch(err => {
    console.error('❌ Dashboard load failed:', err);
  });
}

// ========================================
// Загрузка данных
// ========================================
async function loadDashboard() {
  try {
    const response = await fetch(`${API_BASE}/stats`, {
      headers: getAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error('Ошибка загрузки статистики');
    }
    
    currentStats = await response.json();
    updateDashboardUI();
  } catch (error) {
    console.error('Error loading dashboard:', error);
    showAlert('Ошибка загрузки данных: ' + error.message);
  }
}

async function loadTarologists() {
  showLoading('tarologists-loading', true);
  
  try {
    const response = await fetch(`${API_BASE}/tarologists`, {
      headers: getAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error('Ошибка загрузки списка тарологов');
    }
    
    currentTarologists = await response.json();
    renderTarologistsList();
  } catch (error) {
    console.error('Error loading tarologists:', error);
    showAlert('Ошибка: ' + error.message);
  } finally {
    showLoading('tarologists-loading', false);
  }
}

async function loadTransactions(period = 30) {
  showLoading('transactions-loading', true);
  
  try {
    const url = period === 'all' 
      ? `${API_BASE}/transactions`
      : `${API_BASE}/transactions?days=${period}`;
    
    const response = await fetch(url, {
      headers: getAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error('Ошибка загрузки транзакций');
    }
    
    currentTransactions = await response.json();
    renderTransactionsList();
  } catch (error) {
    console.error('Error loading transactions:', error);
    showAlert('Ошибка: ' + error.message);
  } finally {
    showLoading('transactions-loading', false);
  }
}

async function loadPayouts() {
  showLoading('payouts-loading', true);
  
  try {
    const response = await fetch(`${API_BASE}/payouts`, {
      headers: getAuthHeaders()
    });
    
    if (!response.ok) {
      throw new Error('Ошибка загрузки выплат');
    }
    
    currentPayouts = await response.json();
    renderPayoutsList();
  } catch (error) {
    console.error('Error loading payouts:', error);
    showAlert('Ошибка: ' + error.message);
  } finally {
    showLoading('payouts-loading', false);
  }
}

// ========================================
// Обновление UI
// ========================================
function updateDashboardUI() {
  if (!currentStats) return;
  
  // Общая статистика
  document.getElementById('total-revenue').textContent = formatNumber(currentStats.totalRevenue || 0);
  document.getElementById('developer-cut').textContent = formatNumber(currentStats.developerCut || 0);
  document.getElementById('total-tarologists').textContent = currentStats.totalTarologists || 0;
  document.getElementById('total-sessions').textContent = currentStats.totalSessions || 0;
  
  // Баланс к выплате
  document.getElementById('total-payout').textContent = formatNumber(currentStats.totalPayout || 0);
}

function renderTarologistsList() {
  const container = document.getElementById('tarologists-admin-list');

  if (currentTarologists.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👥</div>
        <div class="empty-state-text">Тарологи не найдены</div>
      </div>
    `;
    return;
  }

  container.innerHTML = currentTarologists.map(tarologist => `
    <div class="tarologist-admin-card" data-id="${tarologist.id}">
      <div class="tarologist-admin-info">
        <div class="tarologist-admin-name">${escapeHtml(tarologist.name)}</div>
        <div class="tarologist-admin-meta">
          <span>⭐ ${tarologist.rating?.toFixed(1) || '0.0'}</span>
          <span>💬 ${tarologist.sessions_count || 0}</span>
        </div>
        <div class="tarologist-admin-actions">
          <button class="tarologist-action-btn edit-btn" data-id="${tarologist.id}">✏️ Редактировать</button>
          <button class="tarologist-action-btn delete-btn" data-id="${tarologist.id}">🗑️ Удалить</button>
        </div>
      </div>
      <div class="tarologist-admin-balance">${formatNumber(tarologist.balance || 0)} ⭐</div>
    </div>
  `).join('');
}

function renderTransactionsList() {
  const container = document.getElementById('transactions-list');

  if (currentTransactions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-text">Транзакции не найдены</div>
      </div>
    `;
    return;
  }

  container.innerHTML = currentTransactions.map(tx => `
    <div class="transaction-item" data-id="${tx.id}">
      <div class="transaction-info">
        <div class="transaction-amount">${formatNumber(tx.stars_amount)} ⭐</div>
        <div class="transaction-details">
          ${escapeHtml(tx.tarologist_name)} • Комиссия: ${formatNumber(tx.developer_cut)} ⭐
        </div>
        <div class="transaction-status status-${tx.status}">
          ${getStatusBadge(tx.status)}
        </div>
      </div>
      <div class="transaction-actions">
        <button class="refund-btn" onclick="window.handleRefundClick(${tx.id})" ${tx.status !== 'completed' ? 'disabled' : ''}>
          ↩️
        </button>
      </div>
      <div class="transaction-date">${formatDate(tx.created_at)}</div>
    </div>
  `).join('');
}

function renderPayoutsList() {
  const container = document.getElementById('payouts-list');
  
  if (currentPayouts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💸</div>
        <div class="empty-state-text">Выплаты не найдены</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = currentPayouts.map(payout => `
    <div class="payout-item" data-id="${payout.id}">
      <div class="payout-info">
        <div class="payout-tarologist">${escapeHtml(payout.tarologist_name)}</div>
        <div class="payout-amount-display">${formatNumber(payout.amount)} ⭐</div>
      </div>
      <div class="payout-status ${payout.status}">${payout.status === 'completed' ? '✅' : '⏳'} ${payout.status === 'completed' ? 'Выполнено' : 'Ожидает'}</div>
    </div>
  `).join('');
}

// ========================================
// Модальные окна
// ========================================
function openTarologistModal(tarologist) {
  selectedTarologistId = tarologist.id;
  
  document.getElementById('modal-tarologist-name').textContent = tarologist.name;
  document.getElementById('modal-tarologist-balance').textContent = `${formatNumber(tarologist.balance || 0)} ⭐`;
  document.getElementById('modal-tarologist-sessions').textContent = tarologist.sessions_count || 0;
  document.getElementById('modal-tarologist-rating').textContent = tarologist.rating?.toFixed(1) || '0.0';
  document.getElementById('modal-tarologist-total').textContent = `${formatNumber(tarologist.total_earned || 0)} ⭐`;
  
  tarologistModal.classList.add('active');
}

function closeTarologistModal() {
  tarologistModal.classList.remove('active');
  selectedTarologistId = null;
}

function openPayoutConfirm(tarologist, amount) {
  selectedPayoutId = tarologist.id;
  
  document.getElementById('confirm-amount').textContent = formatNumber(amount);
  document.getElementById('confirm-name').textContent = tarologist.name;
  
  payoutConfirmModal.classList.add('active');
}

function closePayoutConfirm() {
  payoutConfirmModal.classList.remove('active');
  selectedPayoutId = null;
}

// ========================================
// API запросы
// ========================================
async function markPayout(tarologistId, amount) {
  try {
    const response = await fetch(`${API_BASE}/payouts`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tarologist_id: tarologistId,
        amount: amount
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Ошибка создания выплаты');
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error marking payout:', error);
    throw error;
  }
}

async function saveTarologist(data) {
  const url = data.id 
    ? `${API_BASE}/tarologist/${data.id}`
    : `${API_BASE}/tarologist`;
  
  const method = data.id ? 'PUT' : 'POST';
  
  const response = await fetch(url, {
    method,
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      telegram_id: data.telegram_id,
      name: data.name,
      description: data.description,
      photo_url: data.photo_url
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Ошибка сохранения');
  }

  return await response.json();
}

async function deleteTarologist(id) {
  const response = await fetch(`${API_BASE}/tarologist/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Ошибка удаления');
  }

  return await response.json();
}

// ========================================
// Управление модальным окном редактирования
// ========================================
let editingTarologistId = null;

function openEditModal(tarologist = null) {
  editingTarologistId = tarologist?.id || null;
  
  if (tarologist) {
    editModalTitle.textContent = 'Редактировать таролога';
    editTelegramId.value = tarologist.telegram_id || '';
    editTelegramId.disabled = true; // Нельзя менять ID при редактировании
    editName.value = tarologist.name || '';
    editDescription.value = tarologist.description || '';
    editPhotoUrl.value = tarologist.photo_url || '';
  } else {
    editModalTitle.textContent = 'Добавить таролога';
    editTelegramId.value = '';
    editTelegramId.disabled = false;
    editName.value = '';
    editDescription.value = '';
    editPhotoUrl.value = '';
  }
  
  tarologistEditModal.classList.add('active');
}

function closeEditModal() {
  tarologistEditModal.classList.remove('active');
  editingTarologistId = null;
}

// ========================================
// Обработчики событий
// ========================================
function setupEventListeners() {
  // Навигация
  navButtons.tarologists?.addEventListener('click', () => {
    switchScreen('tarologists');
    loadTarologists();
  });
  
  navButtons.transactions?.addEventListener('click', () => {
    switchScreen('transactions');
    loadTransactions();
  });
  
  navButtons.showPayouts?.addEventListener('click', () => {
    switchScreen('payouts');
    loadPayouts();
  });
  
  // Кнопки назад
  backButtons.tarologists?.addEventListener('click', () => {
    switchScreen('dashboard');
  });
  
  backButtons.transactions?.addEventListener('click', () => {
    switchScreen('dashboard');
  });
  
  backButtons.payouts?.addEventListener('click', () => {
    switchScreen('dashboard');
  });
  
  // Фильтр транзакций
  document.getElementById('filter-period')?.addEventListener('change', (e) => {
    loadTransactions(e.target.value);
  });
  
  // Клик по тарологу (открытие модального окна с информацией)
  document.getElementById('tarologists-admin-list')?.addEventListener('click', (e) => {
    // Игнорируем клики по кнопкам действий
    if (e.target.closest('.tarologist-action-btn')) return;
    
    const card = e.target.closest('.tarologist-admin-card');
    if (card) {
      const tarologist = currentTarologists.find(t => t.id == card.dataset.id);
      if (tarologist) {
        openTarologistModal(tarologist);
      }
    }
  });

  // Кнопка "Добавить таролога"
  document.getElementById('add-tarologist-btn')?.addEventListener('click', () => {
    openEditModal();
  });

  // Редактирование таролога
  document.getElementById('tarologists-admin-list')?.addEventListener('click', (e) => {
    if (e.target.closest('.edit-btn')) {
      const btn = e.target.closest('.edit-btn');
      const tarologist = currentTarologists.find(t => t.id == btn.dataset.id);
      if (tarologist) {
        openEditModal(tarologist);
      }
    }
  });

  // Удаление таролога
  document.getElementById('tarologists-admin-list')?.addEventListener('click', (e) => {
    if (e.target.closest('.delete-btn')) {
      const btn = e.target.closest('.delete-btn');
      const tarologist = currentTarologists.find(t => t.id == btn.dataset.id);
      if (tarologist) {
        if (confirm(`Удалить таролога "${tarologist.name}"?`)) {
          deleteTarologist(tarologist.id)
            .then(() => {
              showAlert('Таролог удалён');
              loadTarologists();
            })
            .catch(error => {
              showAlert('Ошибка: ' + error.message);
            });
        }
      }
    }
  });

  // Сохранение таролога
  document.getElementById('save-tarologist-btn')?.addEventListener('click', async () => {
    const telegramId = editTelegramId.value.trim();
    const name = editName.value.trim();
    const description = editDescription.value.trim();
    const photoUrl = editPhotoUrl.value.trim();

    if (!telegramId) {
      showAlert('Введите Telegram ID');
      return;
    }

    try {
      await saveTarologist({
        id: editingTarologistId,
        telegram_id: telegramId,
        name: name || undefined,
        description: description || undefined,
        photo_url: photoUrl || undefined
      });

      showAlert('Таролог сохранён!');
      closeEditModal();
      await loadTarologists();
      await loadDashboard();
    } catch (error) {
      showAlert('Ошибка: ' + error.message);
    }
  });

  // Отмена редактирования
  document.getElementById('cancel-edit-btn')?.addEventListener('click', closeEditModal);

  // Закрытие модального окна таролога
  document.getElementById('close-modal-btn')?.addEventListener('click', closeTarologistModal);
  
  // Отметить выплату
  document.getElementById('mark-payout-btn')?.addEventListener('click', async () => {
    const tarologist = currentTarologists.find(t => t.id === selectedTarologistId);
    if (!tarologist || !tarologist.balance) {
      showAlert('Нет баланса для выплаты');
      return;
    }
    
    openPayoutConfirm(tarologist, tarologist.balance);
    closeTarologistModal();
  });
  
  // Отмена выплаты
  document.getElementById('cancel-payout-btn')?.addEventListener('click', closePayoutConfirm);
  
  // Подтверждение выплаты
  document.getElementById('confirm-payout-btn')?.addEventListener('click', async () => {
    const tarologist = currentTarologists.find(t => t.id === selectedPayoutId);
    if (!tarologist) return;
    
    try {
      await markPayout(tarologist.id, tarologist.balance);
      showAlert('Выплата отмечена!');
      closePayoutConfirm();
      await loadTarologists();
      await loadDashboard();
    } catch (error) {
      showAlert('Ошибка: ' + error.message);
    }
  });
  
  // Закрытие по клику вне модального окна
  window.addEventListener('click', (e) => {
    if (e.target === tarologistModal) {
      closeTarologistModal();
    }
    if (e.target === payoutConfirmModal) {
      closePayoutConfirm();
    }
    if (e.target === tarologistEditModal) {
      closeEditModal();
    }
  });
}

// ========================================
// Утилиты
// ========================================
function switchScreen(screenName) {
  Object.values(screens).forEach(screen => {
    screen?.classList.remove('active');
  });
  screens[screenName]?.classList.add('active');
}

function showLoading(elementId, show) {
  const element = document.getElementById(elementId);
  if (element) {
    element.classList.toggle('active', show);
  }
}

function getAuthHeaders() {
  const tg = window.Telegram?.WebApp;
  return {
    'X-Telegram-Init-Data': tg?.initData || '',
    'Content-Type': 'application/json'
  };
}

function formatNumber(num) {
  return new Intl.NumberFormat('ru-RU').format(num);
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getStatusBadge(status) {
  const badges = {
    'completed': '✅ Завершено',
    'pending': '⏳ Ожидает',
    'cancelled': '❌ Отменено',
    'refunded': '↩️ Возврат'
  };
  return badges[status] || status;
}

// Глобальная функция для обработки клика refund
window.handleRefundClick = async function(transactionId) {
  // Получаем детальную информацию о транзакции
  try {
    const response = await fetch(`${API_BASE}/transaction/${transactionId}`, {
      headers: getAuthHeaders()
    });
    const data = await response.json();

    if (data.success) {
      // Открываем модальное окно refund
      openRefundModal(data.data);
    } else {
      showAlert('Ошибка загрузки информации о транзакции');
    }
  } catch (error) {
    console.error('Ошибка получения транзакции:', error);
    showAlert('Не удалось загрузить информацию о транзакции');
  }
};

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showAlert(message) {
  const tg = window.Telegram?.WebApp;
  if (tg?.showAlert) {
    tg.showAlert(message);
  } else {
    alert(message);
  }
}

// ========================================
// Запуск
// ========================================
// Не вызываем init() автоматически — вызывается из admin.html после авторизации
// document.addEventListener('DOMContentLoaded', init);
