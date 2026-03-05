/**
 * Spreads Module
 * Логика раскладов Таро
 */

export const dailyPositions = [
  { id: 1, name: "Прошлое", description: "То, что уходит" },
  { id: 2, name: "Настоящее", description: "Текущий момент" },
  { id: 3, name: "Будущее", description: "То, что грядёт" }
];

export function getDailyPosition(index) {
  return dailyPositions[index] || dailyPositions[0];
}

export function formatDailySpreadText(cards) {
  let text = '🔮 Ежедневный расклад Таро\n\n';
  cards.forEach((card, i) => {
    const position = getDailyPosition(i);
    text += `${position.name}: ${card.name_ru}\n${card.description}\n\n`;
  });
  text += '─────────────\n';
  text += 'Ключевые слова:\n';
  cards.forEach((card, i) => {
    const position = getDailyPosition(i);
    text += `${position.name}: ${card.keywords.slice(0, 3).join(', ')}\n`;
  });
  return text;
}
