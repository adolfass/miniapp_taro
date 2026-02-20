# Инструкция по деплою Tarot Mini App на VDS

## 📦 Сборка проекта

```bash
cd /Users/mac/project/miniapp

# Установите зависимости (если нужно)
npm install

# Соберите проект
npm run build
```

Файлы для деплоя будут в папке `dist/`.

---

## 🖥 Загрузка на сервер

### Вариант 1: SCP (рекомендую)

```bash
# Загрузка файлов на сервер
scp -r dist/* user@your-vds-ip:/var/www/tarot-miniapp/
```

### Вариант 2: rsync (удобнее для обновлений)

```bash
rsync -avz --delete dist/ user@your-vds-ip:/var/www/tarot-miniapp/
```

### Вариант 3: Git на сервере

```bash
# На сервере
cd /var/www
git clone https://github.com/adolfass/miniapp_taro.git
cd miniapp_taro
npm install
npm run build
```

---

## ⚙️ Настройка Nginx

Создайте конфиг сайта:

```bash
sudo nano /etc/nginx/sites-available/tarot-miniapp
```

Добавьте конфигурацию:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # или IP адрес

    root /var/www/tarot-miniapp;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Кэширование статики
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|webp|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Gzip сжатие
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
}
```

Активируйте сайт:

```bash
sudo ln -s /etc/nginx/sites-available/tarot-miniapp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🔒 Настройка HTTPS (Let's Encrypt)

```bash
# Установка Certbot
sudo apt update
sudo apt install certbot python3-certbot-nginx

# Получение сертификата
sudo certbot --nginx -d your-domain.com

# Автоматическое обновление
sudo certbot renew --dry-run
```

---

## 📊 Мониторинг и логи

```bash
# Логи Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Статус Nginx
sudo systemctl status nginx

# Перезапуск Nginx
sudo systemctl restart nginx
```

---

## 🔄 Автоматическое обновление (опционально)

Создайте скрипт для обновления:

```bash
nano /var/www/deploy.sh
```

```bash
#!/bin/bash
cd /var/www/miniapp_taro
git pull origin main
npm install
npm run build
sudo systemctl reload nginx
echo "Deploy completed at $(date)"
```

Сделайте исполняемым:
```bash
chmod +x /var/www/deploy.sh
```

Теперь для обновления достаточно:
```bash
./deploy.sh
```

---

## ✅ Чек-лист после деплоя

- [ ] Сайт открывается по HTTPS
- [ ] Все карты загружаются
- [ ] Анимации работают
- [ ] Звук тасовки (если есть файл)
- [ ] Telegram WebApp инициализируется
- [ ] Мобильная версия корректна

---

## 🎯 Следующие шаги

После успешного деплоя:
1. Добавьте ссылку на Mini App в Telegram бота через @BotFather
2. Протестируйте на реальных устройствах
3. Настройте аналитику (если нужно)
4. Готовьтесь к интеграции оплаты звёздами
