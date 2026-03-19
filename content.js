let ranking = []; // List of team names
let enabled = false;

// Load initial state
chrome.storage.sync.get(['ranking', 'enabled'], (data) => {
  if (data.ranking) ranking = data.ranking;
  if (data.enabled !== undefined) enabled = data.enabled;
});

// Listen for changes in storage
if (chrome.storage && chrome.storage.onChanged) {
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
    // Try to find the team names in the subtitle element
    const titleEl = p.querySelector('.mml-subtitle-2');
    const teamName = titleEl ? titleEl.innerText.trim() : `Unknown Game (${p.getAttribute('data-player-id')})`;
    games[teamName] = p;
  });

  return games;
}

const commercialState = new Map(); // teamName -> expirationTimestamp

function isOnCommercial(teamName, playerElement) {
  const text = playerElement.innerText || "";
  const indicator = "Live coverage will return in:";
  const slateIndicator = playerElement.querySelector('._brandedSlate_1ri8z_33');
  const adCounter = playerElement.querySelector('._adCounter_q31gh_174');

  const isCommercialVisible = text.toLowerCase().includes(indicator.toLowerCase()) || !!slateIndicator || !!adCounter;

  if (isCommercialVisible) {
    let duration = 5000; // Sticky buffer: 5s if we can't find a timer
    const match = text.match(/Live coverage will return in:\s*(\d+):(\d+)/i);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      duration = ((minutes * 60 + seconds) + 2) * 1000;
    } else if (adCounter) {
        const adMatch = adCounter.innerText.match(/(\d+):(\d+)/);
        if (adMatch) {
            const minutes = parseInt(adMatch[1], 10);
            const seconds = parseInt(adMatch[2], 10);
            duration = ((minutes * 60 + seconds) + 2) * 1000;
        }
    }

    const expiration = Date.now() + duration;
    commercialState.set(teamName, expiration);
    return true;
  }

  const expiration = commercialState.get(teamName);
  if (expiration) {
    if (Date.now() < expiration) {
      if (isActive(playerElement)) {
        commercialState.delete(teamName);
        return false;
      }
      return true;
    } else {
      commercialState.delete(teamName);
    }
  }

  return false;
}

function isActive(playerElement) {
  return playerElement.classList.contains('_primary_1o8ii_119');
}

function updateGameList() {
    const games = getGameElements();
    const currentTeams = Object.keys(games);
    if (currentTeams.length > 0) {
        chrome.storage.local.set({ detectedTeams: currentTeams });
    }
}

function switchAudio() {
  if (!enabled) return;

  const games = getGameElements();
  const teamNames = Object.keys(games);
  if (teamNames.length === 0) return;

  // Update detected teams for the popup
  updateGameList();

  // Find the highest ranked game that is NOT on commercial
  let targetTeam = null;

  // First check ranked games
  for (const name of ranking) {
    const gameEl = games[name];
    if (gameEl && !isOnCommercial(name, gameEl)) {
      targetTeam = name;
      break;
    }
  }

  // If none of our ranked games are available, or we haven't ranked them yet,
  // pick any game that isn't on commercial
  if (!targetTeam) {
      for (const name of teamNames) {
          const gameEl = games[name];
          if (!isOnCommercial(name, gameEl)) {
              targetTeam = name;
              break;
          }
      }
  }

  // If we found a game and it's not already active, click it
  if (targetTeam) {
    const targetEl = games[targetTeam];
    if (!isActive(targetEl)) {
        console.log(`[NCAA Switcher] Switching audio to: ${targetTeam}`);
        // Reset commercial state since we're switching to it (it's obviously not on commercial if we're here)
        commercialState.delete(targetTeam);
        const clickTarget = targetEl.querySelector('video') || targetEl.querySelector('._videoContainer_q31gh_123') || targetEl;
        clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  }
}

// Run frequently
setInterval(switchAudio, 2000);
setInterval(updateGameList, 5000);
