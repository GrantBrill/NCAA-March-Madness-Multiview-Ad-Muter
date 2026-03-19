let ranking = []; // List of team names
let enabled = false;

// Load initial state
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
  chrome.storage.sync.get(['ranking', 'enabled'], (data) => {
    if (data.ranking) ranking = data.ranking;
    if (data.enabled !== undefined) enabled = data.enabled;
  });
}

// Listen for changes in storage
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      if (changes.ranking) {
        ranking = changes.ranking.newValue;
      }
      if (changes.enabled) {
        enabled = changes.enabled.newValue;
      }
    }
  });
}

function getGameElements() {
  const players = Array.from(document.querySelectorAll('div[data-player-id]'))
    .filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 100 && rect.height > 100;
    });

  const games = {};
  players.forEach(p => {
    const titleEl = p.querySelector('.mml-subtitle-2');
    let teamName = titleEl ? titleEl.innerText.trim() : `Unknown Game (${p.getAttribute('data-player-id')})`;
    const normalized = teamName.toLowerCase();

    games[normalized] = {
        element: p,
        originalName: teamName
    };
  });

  return games;
}

function isOnCommercial(playerElement) {
  const text = (playerElement.innerText || "").toLowerCase();
  const indicator1 = "live coverage will return in:";
  const indicator2 = "commercial break in progress";
  const slateIndicator = playerElement.querySelector('._brandedSlate_1ri8z_33');
  const adCounter = playerElement.querySelector('._adCounter_q31gh_174');

  return text.includes(indicator1) || text.includes(indicator2) || !!slateIndicator || !!adCounter;
}

function isActive(playerElement) {
  return playerElement.classList.contains('_primary_1o8ii_119');
}

function updateGameList() {
    const games = getGameElements();
    const currentTeams = [];

    for (const [normalized, game] of Object.entries(games)) {
        currentTeams.push({
            normalized: normalized,
            originalName: game.originalName
        });
    }

    if (currentTeams.length > 0) {
        chrome.storage.local.set({ detectedTeamsV3: currentTeams });
    }
}

function switchAudio() {
  if (!enabled) return;

  const games = getGameElements();
  const normalizedTeamsOnPage = Object.keys(games);
  if (normalizedTeamsOnPage.length === 0) return;

  updateGameList();

  let targetNormalized = null;

  for (const name of ranking) {
    const normalizedRankedName = name.toLowerCase();
    const game = games[normalizedRankedName];
    if (game && !isOnCommercial(game.element)) {
      targetNormalized = normalizedRankedName;
      break;
    }
  }

  if (!targetNormalized) {
      for (const normalized of normalizedTeamsOnPage) {
          const game = games[normalized];
          if (!isOnCommercial(game.element)) {
              targetNormalized = normalized;
              break;
          }
      }
  }

  if (targetNormalized) {
    const targetEl = games[targetNormalized].element;
    if (!isActive(targetEl)) {
        console.log(`[NCAA Switcher] Switching audio to: ${targetNormalized}`);
        const clickTarget = targetEl.querySelector('video') || targetEl.querySelector('._videoContainer_q31gh_123') || targetEl;
        clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  }
}

setInterval(switchAudio, 2000);
setInterval(updateGameList, 5000);
