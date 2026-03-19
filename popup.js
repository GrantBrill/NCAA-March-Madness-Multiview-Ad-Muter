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

  // Merge ranking and detectedTeams
  // Any team in ranking should come first in that order
  // Any team in detectedTeams but NOT in ranking should be added at the end
  const allTeams = [...new Set([...ranking, ...detectedTeams])];

  // Filter out any teams that are neither in ranking nor currently detected
  const currentTeams = allTeams.filter(t => ranking.includes(t) || detectedTeams.includes(t));

  if (currentTeams.length === 0) {
    list.innerHTML = '';
    emptyMsg.style.display = 'block';
    return;
  }

  emptyMsg.style.display = 'none';
  list.innerHTML = '';

  currentTeams.forEach((teamName, index) => {
    const li = document.createElement('li');
    li.className = 'game-item';
    li.draggable = true;
    li.dataset.id = teamName;

    const rankNum = document.createElement('span');
    rankNum.className = 'rank-num';
    rankNum.innerText = index + 1;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'game-name';
    nameSpan.innerText = teamName;

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
