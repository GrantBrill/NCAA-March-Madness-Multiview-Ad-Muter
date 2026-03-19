let ranking = [];
let enabled = false;
let detectedTeams = []; // Array of { normalized, originalName, commercialUntil }

// Load initial state
chrome.storage.sync.get(['ranking', 'enabled'], (data) => {
  if (data.ranking) ranking = data.ranking;
  if (data.enabled !== undefined) enabled = data.enabled;
  document.getElementById('enableSwitch').checked = enabled;
  renderGameList();
});

// Update enabled state
document.getElementById('enableSwitch').addEventListener('change', (e) => {
  enabled = e.target.checked;
  chrome.storage.sync.set({ enabled });
});

async function renderGameList() {
  const list = document.getElementById('gameList');
  const emptyMsg = document.getElementById('emptyMsg');

  // Get currently detected teams from local storage
  const localData = await chrome.storage.local.get(['detectedTeamsV2']);
  detectedTeams = localData.detectedTeamsV2 || [];

  // If we are currently dragging, don't re-render as it messes up the drag operation
  if (document.querySelector('.dragging')) return;

  const teamMap = new Map();

  // Add existing rankings (which have priority)
  ranking.forEach(name => {
      const lower = name.toLowerCase();
      if (!teamMap.has(lower)) {
          teamMap.set(lower, { originalName: name, commercialUntil: 0 });
      }
  });

  // Add or update with detected teams
  detectedTeams.forEach(game => {
      const lower = game.normalized;
      if (!teamMap.has(lower)) {
          teamMap.set(lower, { originalName: game.originalName, commercialUntil: game.commercialUntil });
      } else {
          // Update the commercial status and potentially the original name if it's more current
          const existing = teamMap.get(lower);
          existing.commercialUntil = game.commercialUntil;
          existing.originalName = game.originalName;
      }
  });

  const allNormalized = [...new Set([...ranking.map(n => n.toLowerCase()), ...detectedTeams.map(g => g.normalized)])];

  if (allNormalized.length === 0) {
    list.innerHTML = '';
    emptyMsg.style.display = 'block';
    return;
  }

  emptyMsg.style.display = 'none';
  list.innerHTML = '';

  allNormalized.forEach((lowerName, index) => {
    const gameInfo = teamMap.get(lowerName);
    const li = document.createElement('li');
    li.className = 'game-item';
    li.draggable = true;
    li.dataset.id = gameInfo.originalName;
    li.dataset.normalized = lowerName;

    const rankNum = document.createElement('span');
    rankNum.className = 'rank-num';
    rankNum.innerText = index + 1;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'game-name';
    nameSpan.innerText = gameInfo.originalName;

    const statusContainer = document.createElement('div');
    statusContainer.className = 'status-container';

    const timerSpan = document.createElement('span');
    timerSpan.className = 'timer';
    statusContainer.appendChild(timerSpan);

    li.appendChild(rankNum);
    li.appendChild(nameSpan);
    li.appendChild(statusContainer);
    list.appendChild(li);

    li.addEventListener('dragstart', () => li.classList.add('dragging'));
    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      saveRanking();
    });
  });

  updateTimers();
}

function updateTimers() {
  const items = document.querySelectorAll('.game-item');
  const now = Date.now();

  items.forEach(item => {
    const normalized = item.dataset.normalized;
    const game = detectedTeams.find(g => g.normalized === normalized);
    const timerEl = item.querySelector('.timer');

    if (game && game.commercialUntil > now) {
      const remaining = Math.ceil((game.commercialUntil - now) / 1000);
      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;
      timerEl.innerText = `AD: ${minutes}:${seconds.toString().padStart(2, '0')}`;
      timerEl.classList.add('on-commercial');
    } else {
      timerEl.innerText = 'LIVE';
      timerEl.classList.remove('on-commercial');
    }
  });
}

function saveRanking() {
  const items = Array.from(document.querySelectorAll('.game-item'));
  ranking = items.map(item => item.dataset.id);
  chrome.storage.sync.set({ ranking });

  items.forEach((item, index) => {
    item.querySelector('.rank-num').innerText = index + 1;
  });
}

const list = document.getElementById('gameList');
list.addEventListener('dragover', e => {
  e.preventDefault();
  const draggingItem = document.querySelector('.dragging');
  const siblings = [...list.querySelectorAll('.game-item:not(.dragging)')];

  const nextSibling = siblings.find(sibling => {
    return e.clientY <= sibling.offsetTop + sibling.offsetHeight / 2;
  });

  list.insertBefore(draggingItem, nextSibling);
});

// Refresh the list for new games and commercial status
setInterval(renderGameList, 3000);
// Update the countdowns every second for a smooth display
setInterval(updateTimers, 1000);
