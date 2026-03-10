import dotenv from 'dotenv';
console.log('Before config:', process.env.TELEGRAM_BOT_TOKEN ? 'EXISTS' : 'NOT SET');
const result = dotenv.config();
console.log('Config error:', result.error?.message || 'OK');
console.log('TOKEN loaded:', process.env.TELEGRAM_BOT_TOKEN ? 'YES - ' + process.env.TELEGRAM_BOT_TOKEN.substring(0, 20) + '...' : 'NO');
console.log('ADMIN_ID:', process.env.ADMIN_TELEGRAM_ID);
