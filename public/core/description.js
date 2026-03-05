/**
 * Описание расклада «Путь» (Хайо Банцхаф)
 * Редактируйте этот файл для изменения текста описания
 */

export const spreadDescription = {
  title: 'Расклад «Путь»',
  subtitle: 'Авторская методика Хайо Банцхафа',
  introduction: `Расклад «Путь» — это авторская методика известного немецкого таролога Хайо Банцхафа. 
  В отличие от многих других раскладов, которые пытаются предсказать фатальное «что будет», 
  «Путь» отвечает на практический вопрос: «Как мне надо вести себя дальше?».
  
  Он подходит для любой жизненной сферы: отношений, работы, финансов, саморазвития или конкретной сложной ситуации. 
  Расклад не лишает вас свободы воли, а, наоборот, показывает, что вы можете сделать, и предлагает варианты решения проблемы ясным и понятным языком.`,
  
  cardsCount: 7,
  deckInfo: 'Используется полная колода (Старшие и Младшие Арканы)',
  
  // Схема расположения
  layout: {
    description: 'Карты выкладываются по следующей схеме:',
    diagram: [
      [' ', '1', ' '],
      ['2', ' ', '7'],
      ['3', ' ', '6'],
      ['4', ' ', '5']
    ]
  },
  
  // Позиции карт
  positions: [
    {
      index: 0,
      number: 1,
      name: 'Суть вопроса',
      position: 'центр',
      level: null,
      description: 'Главная карта расклада. Показывает истинное положение вещей, суть вашей проблемы и то, чего в принципе можно ожидать от текущей ситуации.',
      short: 'Истинное положение вещей, суть проблемы'
    },
    {
      index: 1,
      number: 2,
      name: 'Прошлое — ментальный уровень',
      position: 'левая колонка, верх',
      level: 'ментальный',
      side: 'прошлое',
      description: 'Ваши мысли, идеи, сознательные намерения и логические построения, которые привели к этой ситуации. Рациональное объяснение происходящего.',
      short: 'Мысли, идеи, намерения'
    },
    {
      index: 2,
      number: 3,
      name: 'Прошлое — астральный уровень',
      position: 'левая колонка, центр',
      level: 'астральный',
      side: 'прошлое',
      description: 'Мир эмоций, чувств, подсознательных влечений и желаний. То, что лежит на душе и влияет на ситуацию изнутри.',
      short: 'Эмоции, чувства, подсознание'
    },
    {
      index: 3,
      number: 4,
      name: 'Прошлое — физический уровень',
      position: 'левая колонка, низ',
      level: 'физический',
      side: 'прошлое',
      description: 'Реальные действия, поступки, внешние обстоятельства и поведение в социуме. То, как вас воспринимали другие.',
      short: 'Действия, поступки, обстоятельства'
    },
    {
      index: 4,
      number: 5,
      name: 'Будущее — физический уровень',
      position: 'правая колонка, низ',
      level: 'физический',
      side: 'будущее',
      description: 'Совет, касающийся конкретных действий и поведения с окружающими людьми. Что нужно делать во внешнем мире.',
      short: 'Совет: что делать во внешнем мире'
    },
    {
      index: 5,
      number: 6,
      name: 'Будущее — астральный уровень',
      position: 'правая колонка, центр',
      level: 'астральный',
      side: 'будущее',
      description: 'Подсказка, каким эмоциям стоит доверять, а какие — отпустить. На чем сфокусировать свои чувства.',
      short: 'Совет: каким эмоциям доверять'
    },
    {
      index: 6,
      number: 7,
      name: 'Будущее — ментальный уровень',
      position: 'правая колонка, верх',
      level: 'ментальный',
      side: 'будущее',
      description: 'Совет для ума. Над чем поразмышлять, какие выводы сделать и какую стратегию мышления выбрать, чтобы двигаться дальше.',
      short: 'Совет: какую стратегию мышления выбрать'
    }
  ],
  
  // Три плана бытия
  levels: {
    title: 'Три плана бытия',
    description: 'Позиции образуют пары по трём уровням бытия. Анализируя их в паре, вы можете увидеть, есть ли гармония между вашими мыслями, чувствами и поступками, или же существует внутренний конфликт.',
    pairs: [
      {
        level: 'Ментальный',
        cards: '2 и 7',
        description: 'Мысли прошлого и совет для ума'
      },
      {
        level: 'Астральный',
        cards: '3 и 6',
        description: 'Эмоции прошлого и совет для чувств'
      },
      {
        level: 'Физический',
        cards: '4 и 5',
        description: 'Действия прошлого и совет для действий'
      }
    ]
  },
  
  // Рекомендация
  recommendation: {
    title: 'Как работать с результатом',
    text: `Прочитав толкование всех семи карт, попробуйте связать их в единую картину. 
    Помните, что главная цель расклада — не просто узнать будущее, а найти путь к действию, 
    который приведет вас к желаемому результату уже сегодня.`,
    disclaimer: 'Этот расклад рекомендовано показать профессиональному тарологу для детальной интерпретации.'
  }
};

/**
 * Получить HTML для описания расклада
 */
export function getDescriptionHTML() {
  const { 
    title, 
    subtitle, 
    introduction, 
    cardsCount, 
    deckInfo,
    layout,
    positions, 
    levels,
    recommendation 
  } = spreadDescription;
  
  let html = `
    <p class="description-intro">${introduction.replace(/\n\s*/g, ' ')}</p>
    
    <div class="spread-info">
      <div class="info-item">
        <span class="info-label">Карт:</span>
        <span class="info-value">${cardsCount}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Колода:</span>
        <span class="info-value">${deckInfo}</span>
      </div>
    </div>
    
    <h4 class="section-title">Схема расклада</h4>
    <div class="layout-diagram">
      <div class="layout-row">
        <div class="layout-cell empty"></div>
        <div class="layout-cell card-pos">1</div>
        <div class="layout-cell empty"></div>
      </div>
      <div class="layout-row">
        <div class="layout-cell card-pos">2</div>
        <div class="layout-cell empty"></div>
        <div class="layout-cell card-pos">7</div>
      </div>
      <div class="layout-row">
        <div class="layout-cell card-pos">3</div>
        <div class="layout-cell empty"></div>
        <div class="layout-cell card-pos">6</div>
      </div>
      <div class="layout-row">
        <div class="layout-cell card-pos">4</div>
        <div class="layout-cell empty"></div>
        <div class="layout-cell card-pos">5</div>
      </div>
    </div>
    <p class="layout-caption">Рис. 1: Схема расположения карт в раскладе «Путь»</p>
    
    <h4 class="section-title">Значение позиций</h4>
    <div class="positions-list">
  `;
  
  positions.forEach(pos => {
    const levelBadge = pos.level ? `<span class="level-badge level-${pos.level}">${pos.level}</span>` : '';
    const sideBadge = pos.side ? `<span class="side-badge side-${pos.side}">${pos.side}</span>` : '';
    
    html += `
      <div class="position-item position-${pos.number}">
        <div class="position-header">
          <div class="position-number">${pos.number}</div>
          <div class="position-name">${pos.name}</div>
        </div>
        <div class="position-badges">
          ${levelBadge}
          ${sideBadge}
        </div>
        <div class="position-position">Позиция: ${pos.position}</div>
        <div class="position-description">${pos.description}</div>
      </div>
    `;
  });
  
  html += `
    </div>
    
    <h4 class="section-title">${levels.title}</h4>
    <p class="levels-description">${levels.description}</p>
    <div class="levels-pairs">
  `;
  
  levels.pairs.forEach(pair => {
    html += `
      <div class="level-pair">
        <div class="pair-level">${pair.level}</div>
        <div class="pair-cards">Карты ${pair.cards}</div>
        <div class="pair-description">${pair.description}</div>
      </div>
    `;
  });
  
  html += `
    </div>
    
    <div class="recommendation-section">
      <h4 class="section-title">${recommendation.title}</h4>
      <p class="recommendation-text">${recommendation.text.replace(/\n\s*/g, ' ')}</p>
      <p class="recommendation-disclaimer">${recommendation.disclaimer}</p>
    </div>
  `;
  
  return html;
}
