let ranking = [];
let enabled = false;

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
  const localData = await chrome.storage.local.get(['detectedTeams']);
  const detectedTeams = localData.detectedTeams || [];

  // If we are currently dragging, don't re-render as it messes up the drag operation
  if (document.querySelector('.dragging')) return;

  // Deduplicate and merge rankings and detected teams CASE-INSENSITIVELY
  // We'll use a map to store normalized names (lowercase) -> original names
  const teamMap = new Map();

  // First, add existing rankings (which have priority)
  ranking.forEach(name => {
      const lower = name.toLowerCase();
      if (!teamMap.has(lower)) {
          teamMap.set(lower, name);
      }
  });

  // Next, add detected teams (if not already in ranking)
  detectedTeams.forEach(name => {
      const lower = name.toLowerCase();
      if (!teamMap.has(lower)) {
          teamMap.set(lower, name);
      }
  });

  // Now we have a deduplicated set of teams.
  // The current ranking list (normalized) should be used for order.
  const allNormalized = [...new Set([...ranking.map(n => n.toLowerCase()), ...detectedTeams.map(n => n.toLowerCase())])];

  // Only show teams that are in ranking or currently detected
  // Actually, we should probably only show teams currently detected,
  // OR keep rankings in the list if the user has already sorted them (to keep the list stable)
  // Let's stick with: all teams that the user has ranked, plus any new ones found.

  if (allNormalized.length === 0) {
    list.innerHTML = '';
    emptyMsg.style.display = 'block';
    return;
  }

  emptyMsg.style.display = 'none';
  list.innerHTML = '';

  allNormalized.forEach((lowerName, index) => {
    const originalName = teamMap.get(lowerName);
    const li = document.createElement('li');
    li.className = 'game-item';
    li.draggable = true;
    li.dataset.id = originalName; // We keep the "best" casing for the ID

    const rankNum = document.createElement('span');
    rankNum.className = 'rank-num';
    rankNum.innerText = index + 1;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'game-name';
    nameSpan.innerText = originalName;

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

  // Refresh rank numbers
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

// Periodically refresh the list to catch new games
setInterval(renderGameList, 5000);
