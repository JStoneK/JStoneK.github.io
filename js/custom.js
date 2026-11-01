(() => {
  'use strict';

  const CALENDAR_USER = 'JStoneK';
  const CONTRIBUTIONS_API = 'https://github-contributions-api.jogruber.de/v4';
  const LIQUID_GLASS_SELECTOR = [
    '.recent-post-item',
    '.github-calendar-card',
    '.layout > div:first-child:not(.nc)',
    '#aside-content .card-widget',
    '#article-container .article-sort-item',
    '.flink-list-item',
    '.search-dialog'
  ].join(', ');
  const calloutTypes = {
    NOTE: { label: '注意', icon: 'ℹ️' },
    TIP: { label: '提示', icon: '💡' },
    IMPORTANT: { label: '重要', icon: '❗' },
    WARNING: { label: '警告', icon: '⚠️' },
    CAUTION: { label: '小心', icon: '🚨' }
  };

  function getPreviousCalendarYear() {
    return new Date().getFullYear() - 1;
  }

  async function fetchCalendarDays(period) {
    const url = `${CONTRIBUTIONS_API}/${encodeURIComponent(CALENDAR_USER)}?y=${period}`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Contribution API returned ${response.status}`);

    const payload = await response.json();
    if (!Array.isArray(payload.contributions)) throw new Error('Contribution API returned invalid data');

    const yearPrefix = Number.isInteger(period) ? `${period}-` : null;
    return payload.contributions
      .filter(day => !yearPrefix || day.date.startsWith(yearPrefix))
      .map(day => ({
        dateKey: day.date,
        date: new Date(`${day.date}T00:00:00`),
        count: Number(day.count) || 0,
        level: Math.max(0, Math.min(4, Number(day.level) || 0))
      }))
      .sort((left, right) => left.date - right.date);
  }

  function calculateCalendarStats(days) {
    let total = 0;
    let running = 0;
    let runningStart = null;
    let longest = 0;
    let longestStart = null;
    let longestEnd = null;

    days.forEach(day => {
      total += day.count;
      if (day.count > 0) {
        if (running === 0) runningStart = day.date;
        running += 1;
        if (running > longest) {
          longest = running;
          longestStart = runningStart;
          longestEnd = day.date;
        }
      } else {
        running = 0;
        runningStart = null;
      }
    });

    const current = running;
    const currentStart = current > 0 ? runningStart : null;
    const currentEnd = current > 0 ? days.at(-1)?.date : null;
    return { total, longest, longestStart, longestEnd, current, currentStart, currentEnd };
  }

  function formatCalendarDate(date) {
    if (!date) return '';
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(date);
  }

  function formatDateRange(start, end, emptyText) {
    if (!start || !end) return emptyText;
    return `${formatCalendarDate(start)} – ${formatCalendarDate(end)}`;
  }

  function createStatColumn(label, value, detail) {
    const column = document.createElement('div');
    column.className = 'contrib-column table-column';

    const labelElement = document.createElement('span');
    labelElement.className = 'text-muted';
    labelElement.textContent = label;

    const valueElement = document.createElement('span');
    valueElement.className = 'contrib-number';
    valueElement.textContent = value;

    const detailElement = document.createElement('span');
    detailElement.className = 'text-muted';
    detailElement.textContent = detail;

    column.append(labelElement, valueElement, detailElement);
    return column;
  }

  function toDateKey(date) {
    return date.toISOString().slice(0, 10);
  }

  function renderCalendarGraph(calendar, days) {
    if (!days.length) return;

    const dayMap = new Map(days.map(day => [day.dateKey, day]));
    const dayMs = 24 * 60 * 60 * 1000;
    const rangeStart = new Date(`${days[0].dateKey}T00:00:00Z`);
    const rangeEnd = new Date(`${days.at(-1).dateKey}T00:00:00Z`);
    const gridStart = new Date(rangeStart);
    gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
    const gridEnd = new Date(rangeEnd);
    gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - gridEnd.getUTCDay()));
    const weekCount = Math.round((gridEnd - gridStart) / dayMs / 7) + 1;

    const viewport = document.createElement('div');
    viewport.className = 'contribution-calendar-viewport';
    const graph = document.createElement('div');
    graph.className = 'contribution-calendar';
    graph.style.setProperty('--calendar-weeks', weekCount);

    const months = document.createElement('div');
    months.className = 'contribution-months';
    const monthCursor = new Date(Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), 1));
    let previousLabelYear = null;
    while (monthCursor <= rangeEnd) {
      const labelDate = monthCursor < gridStart ? gridStart : monthCursor;
      const weekIndex = Math.floor((labelDate - gridStart) / dayMs / 7) + 1;
      const month = monthCursor.getUTCMonth();
      const year = monthCursor.getUTCFullYear();
      const label = document.createElement('span');
      label.style.gridColumnStart = weekIndex;
      label.textContent = previousLabelYear !== year ? `${year}年${month + 1}月` : `${month + 1}月`;
      months.appendChild(label);
      previousLabelYear = year;
      monthCursor.setUTCMonth(monthCursor.getUTCMonth() + 1);
    }

    const body = document.createElement('div');
    body.className = 'contribution-grid-body';
    const weekdayLabels = document.createElement('div');
    weekdayLabels.className = 'contribution-weekdays';
    ['', '一', '', '三', '', '五', ''].forEach(labelText => {
      const label = document.createElement('span');
      label.textContent = labelText;
      weekdayLabels.appendChild(label);
    });

    const weeks = document.createElement('div');
    weeks.className = 'contribution-weeks';
    for (let week = 0; week < weekCount; week += 1) {
      for (let weekday = 0; weekday < 7; weekday += 1) {
        const date = new Date(gridStart.getTime() + (week * 7 + weekday) * dayMs);
        const dateKey = toDateKey(date);
        const day = dayMap.get(dateKey);
        const cell = document.createElement('span');
        cell.className = day ? 'contribution-day' : 'contribution-day is-outside-range';

        if (day) {
          cell.dataset.level = String(day.level);
          cell.title = `${formatCalendarDate(day.date)}：${day.count} 次提交`;
          cell.setAttribute('aria-label', cell.title);
        } else {
          cell.setAttribute('aria-hidden', 'true');
        }
        weeks.appendChild(cell);
      }
    }

    body.append(weekdayLabels, weeks);

    const legend = document.createElement('div');
    legend.className = 'contribution-legend';
    const less = document.createElement('span');
    less.textContent = '少';
    legend.appendChild(less);
    for (let level = 0; level <= 4; level += 1) {
      const sample = document.createElement('span');
      sample.className = 'contribution-day';
      sample.dataset.level = String(level);
      sample.setAttribute('aria-hidden', 'true');
      legend.appendChild(sample);
    }
    const more = document.createElement('span');
    more.textContent = '多';
    legend.appendChild(more);

    graph.append(months, body, legend);
    viewport.appendChild(graph);
    calendar.appendChild(viewport);
  }

  function renderCalendarStats(calendar, days, year) {
    calendar.querySelector('.github-calendar-stats')?.remove();
    if (!days.length) return;

    const stats = calculateCalendarStats(days);
    const rangeStart = new Date(`${year}-01-01T00:00:00`);
    const rangeEnd = new Date(`${year}-12-31T00:00:00`);
    const wrapper = document.createElement('div');
    wrapper.className = 'github-calendar-stats';
    wrapper.append(
      createStatColumn(
        `${year} 年提交`,
        `${stats.total} 次`,
        formatDateRange(rangeStart, rangeEnd, '暂无数据')
      ),
      createStatColumn(
        '最长连续天数',
        `${stats.longest} 天`,
        formatDateRange(stats.longestStart, stats.longestEnd, '暂无连续贡献')
      ),
      createStatColumn(
        '年末连续天数',
        `${stats.current} 天`,
        formatDateRange(stats.currentStart, stats.currentEnd, '年末暂无连续贡献')
      )
    );
    calendar.appendChild(wrapper);
  }

  async function initCalendar() {
    const recentPosts = document.querySelector('.recent-post-items');
    const staleCalendar = document.querySelector('.github-calendar-card');

    // Only the home page has a recent-post list. Remove any stale PJAX copy elsewhere.
    if (!recentPosts) {
      staleCalendar?.remove();
      return;
    }

    const calendar = staleCalendar || document.createElement('div');
    calendar.className = 'github-calendar-card liquid-glass';
    calendar.innerHTML = '<p class="github-calendar-card__status">GitHub Calendar 加载中…</p>';
    recentPosts.parentNode.insertBefore(calendar, recentPosts);

    try {
      const year = getPreviousCalendarYear();
      const [latestDays, previousYearDays] = await Promise.all([
        fetchCalendarDays('last'),
        fetchCalendarDays(year)
      ]);
      if (!calendar.isConnected || !document.querySelector('.recent-post-items')) return;

      calendar.innerHTML = '';
      renderCalendarGraph(calendar, latestDays);
      renderCalendarStats(calendar, previousYearDays, year);
    } catch (error) {
      console.error('[custom] GitHub calendar failed:', error);
      if (calendar.isConnected) {
        calendar.innerHTML = '<p class="github-calendar-card__status">GitHub Calendar 加载失败</p>';
      }
    }
  }

  function initCallouts() {
    document.querySelectorAll('#article-container blockquote:not(.callout)').forEach(blockquote => {
      const marker = blockquote.firstElementChild;
      if (!marker) return;

      const match = marker.textContent.trim().match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/i);
      if (!match) return;

      const type = match[1].toUpperCase();
      const config = calloutTypes[type];
      blockquote.classList.add('callout', `callout-${type.toLowerCase()}`);
      marker.remove();

      const title = document.createElement('div');
      title.className = 'callout-title';
      title.innerHTML = `<span aria-hidden="true">${config.icon}</span><span>${config.label}</span>`;
      blockquote.prepend(title);
    });
  }

  function initScrollAnimations() {
    const selector = '.recent-post-item, .article-sort-item, .card-widget';
    const items = document.querySelectorAll(`${selector}:not([data-scroll-animated])`);
    if (!items.length) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || typeof window.IntersectionObserver !== 'function') {
      items.forEach(item => {
        item.dataset.scrollAnimated = 'true';
        item.style.removeProperty('opacity');
        item.style.removeProperty('transform');
      });
      return;
    }

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.1 });

    items.forEach(item => {
      item.dataset.scrollAnimated = 'true';
      item.style.opacity = '0';
      item.style.transform = 'translateY(30px)';
      item.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
      observer.observe(item);
    });
  }

  function ensurePjaxLoader() {
    let loader = document.getElementById('pill-loader');
    if (loader) return loader;

    loader = document.createElement('div');
    loader.id = 'pill-loader';
    loader.setAttribute('aria-hidden', 'true');
    loader.innerHTML = '<div class="bar"></div>';
    document.body.appendChild(loader);
    return loader;
  }

  function showPjaxLoader() {
    const loader = ensurePjaxLoader();
    const bar = loader.querySelector('.bar');
    loader.classList.remove('is-active');
    void bar.offsetWidth;
    loader.classList.add('is-active');
  }

  function hidePjaxLoader() {
    window.setTimeout(() => document.getElementById('pill-loader')?.classList.remove('is-active'), 250);
  }

  function initLiquidGlass() {
    document.querySelectorAll(LIQUID_GLASS_SELECTOR).forEach(element => {
      element.classList.add('liquid-glass');
    });

    if (document.documentElement.dataset.liquidGlassBound === 'true') return;
    document.documentElement.dataset.liquidGlassBound = 'true';

    const canTrackPointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!canTrackPointer) return;

    let frameId = 0;
    let pendingCard = null;
    let pendingX = 50;
    let pendingY = 28;

    document.addEventListener('pointermove', event => {
      const card = event.target.closest?.('.liquid-glass');
      if (!card) return;

      const rect = card.getBoundingClientRect();
      pendingCard = card;
      pendingX = ((event.clientX - rect.left) / rect.width) * 100;
      pendingY = ((event.clientY - rect.top) / rect.height) * 100;

      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        pendingCard?.style.setProperty('--liquid-x', `${pendingX.toFixed(2)}%`);
        pendingCard?.style.setProperty('--liquid-y', `${pendingY.toFixed(2)}%`);
        frameId = 0;
      });
    }, { passive: true });

    document.addEventListener('pointerout', event => {
      const card = event.target.closest?.('.liquid-glass');
      if (!card || card.contains(event.relatedTarget)) return;
      card.style.removeProperty('--liquid-x');
      card.style.removeProperty('--liquid-y');
    }, { passive: true });
  }

  function initPage() {
    initCallouts();
    initLiquidGlass();
    initScrollAnimations();
    void initCalendar();
  }

  document.addEventListener('pjax:send', showPjaxLoader);
  document.addEventListener('pjax:complete', () => {
    hidePjaxLoader();
    initPage();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensurePjaxLoader();
      initPage();
    }, { once: true });
  } else {
    ensurePjaxLoader();
    initPage();
  }
})();
