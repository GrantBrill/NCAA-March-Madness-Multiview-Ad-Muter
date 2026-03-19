document.addEventListener('DOMContentLoaded', () => {
  const gameList = document.getElementById('gameList');
  const enableSwitch = document.getElementById('enableSwitch');

  // Load state from storage
  chrome.storage.sync.get(['ranking', 'enabled'], (data) => {
    if (data.ranking) {
      // Reorder items according to ranking
      data.ranking.forEach((id) => {
        const item = gameList.querySelector(`[data-id="${id}"]`);
        if (item) gameList.appendChild(item);
      });
      updateRankNumbers();
    }
    if (data.enabled !== undefined) {
      enableSwitch.checked = data.enabled;
    }
  });

  // Handle Drag and Drop
  let draggingItem = null;

  gameList.addEventListener('dragstart', (e) => {
    draggingItem = e.target;
    e.target.classList.add('dragging');
  });

  gameList.addEventListener('dragend', (e) => {
    e.target.classList.remove('dragging');
    draggingItem = null;
    saveState();
    updateRankNumbers();
  });

  gameList.addEventListener('dragover', (e) => {
    e.preventDefault();
    const afterElement = getDragAfterElement(gameList, e.clientY);
    if (afterElement == null) {
      gameList.appendChild(draggingItem);
    } else {
      gameList.insertBefore(draggingItem, afterElement);
    }
  });

  enableSwitch.addEventListener('change', () => {
    saveState();
  });

  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.game-item:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  function updateRankNumbers() {
    const rankNums = gameList.querySelectorAll('.rank-num');
    rankNums.forEach((span, index) => {
      span.textContent = index + 1;
    });
  }

  function saveState() {
    const ranking = [...gameList.querySelectorAll('.game-item')].map(item => item.dataset.id);
    chrome.storage.sync.set({
      ranking: ranking,
      enabled: enableSwitch.checked
    });
  }
});
