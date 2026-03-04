/**
 * Refund Module
 * Обработка отмены оплаты (возврат средств) в админ-панели
 */

let currentRefundTransaction = null;

// DOM элементы
const refundModal = document.getElementById('refund-modal');
const refundTransactionId = document.getElementById('refund-transaction-id');
const refundAmount = document.getElementById('refund-amount');
const refundUser = document.getElementById('refund-user');
const refundReasonInput = document.getElementById('refund-reason-input');
const cancelRefundBtn = document.getElementById('cancel-refund-btn');
const confirmRefundBtn = document.getElementById('confirm-refund-btn');

// Инициализация
export function initRefund() {
  setupEventListeners();
}

function setupEventListeners() {
  // Отмена refund
  cancelRefundBtn?.addEventListener('click', closeRefundModal);

  // Подтверждение refund
  confirmRefundBtn?.addEventListener('click', processRefund);

  // Закрытие по клику вне
  refundModal?.addEventListener('click', (e) => {
    if (e.target === refundModal) {
      closeRefundModal();
    }
  });
}

// Открытие модального окна refund
export function openRefundModal(transaction) {
  currentRefundTransaction = transaction;

  refundTransactionId.textContent = transaction.id;
  refundAmount.textContent = `${transaction.stars_amount} ⭐`;
  refundUser.textContent = transaction.user_telegram_id || '—';
  refundReasonInput.value = '';

  refundModal.classList.add('active');
}

// Закрытие модального окна
function closeRefundModal() {
  refundModal.classList.remove('active');
  currentRefundTransaction = null;
  refundReasonInput.value = '';
}

// Обработка refund
async function processRefund() {
  if (!currentRefundTransaction) return;

  const reason = refundReasonInput.value.trim() || 'Refund by admin request';

  try {
    // Блокируем кнопку
    confirmRefundBtn.disabled = true;
    confirmRefundBtn.textContent = '⏳ Обработка...';

    // Отправляем запрос на отмену оплаты
    const response = await fetch('/api/admin/cancel-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': window.Telegram?.WebApp?.initData || ''
      },
      body: JSON.stringify({
        transactionId: currentRefundTransaction.id,
        reason: reason
      })
    });

    const data = await response.json();

    if (data.success) {
      // Успешный возврат
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(
          `✅ Возврат выполнен!\n\nСумма: ${currentRefundTransaction.stars_amount} ⭐\nСредства будут зачислены пользователю в течение нескольких минут.`
        );
      } else {
        alert(`✅ Возврат выполнен!\nСумма: ${currentRefundTransaction.stars_amount} ⭐`);
      }

      // Закрываем модальное окно
      closeRefundModal();

      // Перезагружаем список транзакций
      if (window.loadTransactions) {
        await window.loadTransactions();
      }
    } else {
      // Ошибка
      throw new Error(data.error || 'Refund failed');
    }
  } catch (error) {
    console.error('Ошибка возврата:', error);

    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.showAlert(`❌ Ошибка возврата:\n${error.message}`);
    } else {
      alert(`❌ Ошибка возврата:\n${error.message}`);
    }
  } finally {
    // Разблокируем кнопку
    confirmRefundBtn.disabled = false;
    confirmRefundBtn.textContent = '💰 Вернуть средства';
  }
}

// Экспорт
