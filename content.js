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
    let teamName = titleEl ? titleEl.innerText.trim() : `Unknown Game (${p.getAttribute('data-player-id')})`;

    // Normalize casing for internal logic
    const normalized = teamName.toLowerCase();

    games[normalized] = {
        element: p,
        originalName: teamName
    };
  });

  return games;
}

const commercialState = new Map(); // normalizedTeamName -> expirationTimestamp

function isOnCommercial(normalizedTeamName, playerElement) {
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
    commercialState.set(normalizedTeamName, expiration);
    return true;
  }

  const expiration = commercialState.get(normalizedTeamName);
  if (expiration) {
    if (Date.now() < expiration) {
      if (isActive(playerElement)) {
        commercialState.delete(normalizedTeamName);
        return false;
      }
      return true;
    } else {
      commercialState.delete(normalizedTeamName);
    }
  }

  return false;
}

function isActive(playerElement) {
  return playerElement.classList.contains('_primary_1o8ii_119');
}

function updateGameList() {
    const games = getGameElements();
    const currentTeams = [];

    for (const [normalized, game] of Object.entries(games)) {
        isOnCommercial(normalized, game.element);
        const expiration = commercialState.get(normalized) || 0;
        currentTeams.push({
            normalized: normalized,
            originalName: game.originalName,
            commercialUntil: expiration
        });
    }

    if (currentTeams.length > 0) {
        chrome.storage.local.set({ detectedTeamsV2: currentTeams });
    }
}

function updateOverlays() {
    const rawGames = getGameElements();
    const games = rawGames || {};
    const now = Date.now();

    // Clear any overlays for games that are no longer on the page
    const playerIdsOnPage = rawGames ? Object.values(rawGames).map(g => g.element.getAttribute('data-player-id')) : [];
    document.querySelectorAll('.ncaa-timer-overlay').forEach(ov => {
        const ovId = ov.id.replace('ncaa-overlay-', '');
        if (!playerIdsOnPage.includes(ovId)) {
            ov.remove();
        }
    });

    for (const [normalized, game] of Object.entries(games)) {
        const expiration = commercialState.get(normalized) || 0;
        const playerEl = game.element;
        let overlay = document.getElementById(`ncaa-overlay-${game.element.getAttribute('data-player-id')}`);

        if (expiration > now) {
            const rect = playerEl.getBoundingClientRect();
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = `ncaa-overlay-${game.element.getAttribute('data-player-id')}`;
                overlay.className = 'ncaa-timer-overlay';
                // Style: big, bold, orange
                Object.assign(overlay.style, {
                    position: 'fixed',
                    color: '#ff6600', // March Madness Orange
                    fontSize: '64px',
                    fontWeight: '900',
                    fontFamily: 'sans-serif',
                    textShadow: '3px 3px 6px rgba(0,0,0,0.8)',
                    zIndex: '1000',
                    pointerEvents: 'none',
                    textAlign: 'center',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                });
                document.body.appendChild(overlay);
            }

            // Sync overlay position with player element
            Object.assign(overlay.style, {
                top: `${rect.top}px`,
                left: `${rect.left}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`
            });

            const remaining = Math.ceil((expiration - now) / 1000);
            const minutes = Math.floor(remaining / 60);
            const seconds = remaining % 60;
            overlay.innerText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            overlay.style.display = 'flex';
        } else if (overlay) {
            overlay.style.display = 'none';
        }
    }
}

function switchAudio() {
  if (!enabled) return;

  const games = getGameElements();
  const normalizedTeamsOnPage = Object.keys(games);
  if (normalizedTeamsOnPage.length === 0) return;

  // Update detected teams for the popup
  updateGameList();

  // Find the highest ranked game that is NOT on commercial
  let targetNormalized = null;

  // First check ranked games
  for (const name of ranking) {
    const normalizedRankedName = name.toLowerCase();
    const game = games[normalizedRankedName];
    if (game && !isOnCommercial(normalizedRankedName, game.element)) {
      targetNormalized = normalizedRankedName;
      break;
    }
  }

  // If none of our ranked games are available, or we haven't ranked them yet,
  // pick any game that isn't on commercial
  if (!targetNormalized) {
      for (const normalized of normalizedTeamsOnPage) {
          const game = games[normalized];
          if (!isOnCommercial(normalized, game.element)) {
              targetNormalized = normalized;
              break;
          }
      }
  }

  // If we found a game and it's not already active, click it
  if (targetNormalized) {
    const targetEl = games[targetNormalized].element;
    if (!isActive(targetEl)) {
        console.log(`[NCAA Switcher] Switching audio to: ${targetNormalized}`);
        // Reset commercial state since we're switching to it
        commercialState.delete(targetNormalized);
        const clickTarget = targetEl.querySelector('video') || targetEl.querySelector('._videoContainer_q31gh_123') || targetEl;
        clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  }
}

// Run frequently
setInterval(switchAudio, 2000);
// Update the overlays and game list every second for a smooth countdown
setInterval(() => {
    updateGameList();
    updateOverlays();
}, 1000);
