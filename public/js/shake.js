/**
 * Shake Detection Module
 * Детекция встряхивания телефона для активации расклада
 */

let shakeHandler = null;
let isListening = false;

export function initShake(callback, threshold = 15, timeout = 1000) {
  if (isListening) return;

  let lastTime = 0;
  let lastX, lastY, lastZ;

  shakeHandler = function handleMotion(event) {
    const acceleration = event.accelerationIncludingGravity;
    if (!acceleration) return;

    const { x, y, z } = acceleration;
    const currentTime = Date.now();

    if (lastX !== undefined) {
      const deltaX = Math.abs(x - lastX);
      const deltaY = Math.abs(y - lastY);
      const deltaZ = Math.abs(z - lastZ);
      const totalDelta = deltaX + deltaY + deltaZ;

      if (totalDelta > threshold && (currentTime - lastTime) > timeout) {
        callback();
        lastTime = currentTime;

        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
      }
    }

    lastX = x;
    lastY = y;
    lastZ = z;
  };

  if (window.DeviceMotionEvent) {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission()
        .then((permissionState) => {
          if (permissionState === 'granted') {
            window.addEventListener('devicemotion', shakeHandler);
            isListening = true;
          }
        })
        .catch((error) => {
          console.error('Ошибка запроса разрешения на акселерометр:', error);
        });
    } else {
      window.addEventListener('devicemotion', shakeHandler);
      isListening = true;
    }
  } else {
    console.warn('DeviceMotionEvent не поддерживается на этом устройстве');
  }
}

export function stopShake() {
  if (shakeHandler) {
    window.removeEventListener('devicemotion', shakeHandler);
    shakeHandler = null;
    isListening = false;
  }
}
