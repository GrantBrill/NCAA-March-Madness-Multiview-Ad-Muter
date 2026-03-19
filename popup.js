let ranking = [];
let enabled = false;
let detectedTeams = []; // Array of { normalized, originalName }

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
  const localData = await chrome.storage.local.get(['detectedTeamsV3']);
  detectedTeams = localData.detectedTeamsV3 || [];

  // If we are currently dragging, don't re-render as it messes up the drag operation
  if (document.querySelector('.dragging')) return;

  const teamMap = new Map();

  // Add existing rankings (which have priority)
  ranking.forEach(name => {
      const lower = name.toLowerCase();
      if (!teamMap.has(lower)) {
          teamMap.set(lower, { originalName: name });
      }
  });

  // Add or update with detected teams
  detectedTeams.forEach(game => {
      const lower = game.normalized;
      if (!teamMap.has(lower)) {
          teamMap.set(lower, { originalName: game.originalName });
      } else {
          const existing = teamMap.get(lower);
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

    li.appendChild(rankNum);
    li.appendChild(nameSpan);
    list.appendChild(li);

    li.addEventListener('dragstart', () => li.classList.add('dragging'));
    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      saveRanking();
    });
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

// Refresh the list for new games
setInterval(renderGameList, 5000);
