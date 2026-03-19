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

// normalizedTeamName -> { expirationTimestamp, lastSeenTimerText, streamTimeAtLastUpdate, localTimeAtLastUpdate }
const commercialState = new Map();
const lastSeenTeams = new Map(); // normalizedTeamName -> lastSeenTimestamp

function isOnCommercial(normalizedTeamName, playerElement) {
  const text = playerElement.innerText || "";
  const indicator = "Live coverage will return in:";
  const slateIndicator = playerElement.querySelector('._brandedSlate_1ri8z_33');
  const adCounter = playerElement.querySelector('._adCounter_q31gh_174');

  const isCommercialVisible = text.toLowerCase().includes(indicator.toLowerCase()) || !!slateIndicator || !!adCounter;

  if (isCommercialVisible) {
    let timerText = "";
    const match = text.match(/Live coverage will return in:\s*(\d+):(\d+)/i);
    if (match) {
        timerText = `${match[1]}:${match[2]}`;
    } else if (adCounter) {
        const adMatch = adCounter.innerText.match(/(\d+):(\d+)/);
        if (adMatch) timerText = `${adMatch[1]}:${adMatch[2]}`;
    }

    const state = commercialState.get(normalizedTeamName) || { expirationTimestamp: 0, lastSeenTimerText: "", streamTimeAtLastUpdate: 0, localTimeAtLastUpdate: 0 };

    if (timerText && timerText !== state.lastSeenTimerText) {
        const parts = timerText.split(':');
        const streamSeconds = (parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10));
        // Use +2s for the actual expiration/switching logic
        state.expirationTimestamp = Date.now() + (streamSeconds + 2) * 1000;
        state.lastSeenTimerText = timerText;
        state.streamTimeAtLastUpdate = streamSeconds;
        state.localTimeAtLastUpdate = Date.now();
        commercialState.set(normalizedTeamName, state);
    } else if (!timerText && !!(slateIndicator || adCounter)) {
        // If no text but slate/ad counter visible, use a 5s sticky buffer if not already set or if expired
        if (Date.now() > state.expirationTimestamp) {
            state.expirationTimestamp = Date.now() + 5000;
            state.streamTimeAtLastUpdate = 5;
            state.localTimeAtLastUpdate = Date.now();
            commercialState.set(normalizedTeamName, state);
        }
    }

    return true;
  }

  const state = commercialState.get(normalizedTeamName);
  if (state) {
    if (Date.now() < state.expirationTimestamp) {
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
    const now = Date.now();

    for (const [normalized, game] of Object.entries(games)) {
        isOnCommercial(normalized, game.element);
        lastSeenTeams.set(normalized, now);

        const state = commercialState.get(normalized);
        const expiration = state ? state.expirationTimestamp : 0;
        currentTeams.push({
            normalized: normalized,
            originalName: game.originalName,
            commercialUntil: expiration
        });
    }

    if (currentTeams.length > 0) {
        chrome.storage.local.set({ detectedTeamsV2: currentTeams });
    }

    // Dead entry removal: if a ranked team hasn't been seen for 60 seconds, remove it
    const staleLimit = 60000;
    const currentRanking = [...ranking];
    const filteredRanking = currentRanking.filter(name => {
        const normalized = name.toLowerCase();
        const lastSeen = lastSeenTeams.get(normalized);
        // If it's on the page right now or was seen recently, keep it.
        // Also keep it if it was never seen (maybe user just added it) but give it a timeout eventually?
        // Let's say if we have a lastSeen, it must be recent.
        if (lastSeen && (now - lastSeen > staleLimit)) {
            return false;
        }
        return true;
    });

    if (filteredRanking.length !== currentRanking.length) {
        console.log(`[NCAA Switcher] Removing dead entries. Before: ${currentRanking.length}, After: ${filteredRanking.length}`);
        chrome.storage.sync.set({ ranking: filteredRanking });
    }
}

function updateOverlays() {
    const rawGames = getGameElements();
    const games = rawGames || {};
    const now = Date.now();

    const playerIdsOnPage = rawGames ? Object.values(rawGames).map(g => g.element.getAttribute('data-player-id')) : [];
    document.querySelectorAll('.ncaa-timer-overlay').forEach(ov => {
        const ovId = ov.id.replace('ncaa-overlay-', '');
        if (!playerIdsOnPage.includes(ovId)) {
            ov.remove();
        }
    });

    for (const [normalized, game] of Object.entries(games)) {
        const state = commercialState.get(normalized);
        const playerEl = game.element;
        let overlay = document.getElementById(`ncaa-overlay-${game.element.getAttribute('data-player-id')}`);

        if (state && state.expirationTimestamp > now) {
            const rect = playerEl.getBoundingClientRect();
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = `ncaa-overlay-${game.element.getAttribute('data-player-id')}`;
                overlay.className = 'ncaa-timer-overlay';
                Object.assign(overlay.style, {
                    position: 'fixed',
                    color: '#ff6600',
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

            Object.assign(overlay.style, {
                top: `${rect.top}px`,
                left: `${rect.left}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`
            });

            // Priority 1: Use the exact timer text currently visible on the page
            const playerText = playerEl.innerText || "";
            const match = playerText.match(/Live coverage will return in:\s*(\d+):(\d+)/i);
            const adCounter = playerEl.querySelector('._adCounter_q31gh_174');
            let displayTime = "";

            if (match) {
                displayTime = `${match[1]}:${match[2]}`;
            } else if (adCounter) {
                const adMatch = adCounter.innerText.match(/(\d+):(\d+)/);
                if (adMatch) displayTime = `${adMatch[1]}:${adMatch[2]}`;
            }

            // Priority 2: Use predicted time if the stream timer isn't currently visible
            if (!displayTime && state.streamTimeAtLastUpdate > 0) {
                const elapsed = Math.floor((now - state.localTimeAtLastUpdate) / 1000);
                const remaining = Math.max(0, state.streamTimeAtLastUpdate - elapsed);
                const minutes = Math.floor(remaining / 60);
                const seconds = remaining % 60;
                displayTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }

            if (displayTime) {
                overlay.innerText = displayTime;
                overlay.style.display = 'flex';
            } else {
                overlay.style.display = 'none';
            }
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

  updateGameList();

  let targetNormalized = null;

  for (const name of ranking) {
    const normalizedRankedName = name.toLowerCase();
    const game = games[normalizedRankedName];
    if (game && !isOnCommercial(normalizedRankedName, game.element)) {
      targetNormalized = normalizedRankedName;
      break;
    }
  }

  if (!targetNormalized) {
      for (const normalized of normalizedTeamsOnPage) {
          const game = games[normalized];
          if (!isOnCommercial(normalized, game.element)) {
              targetNormalized = normalized;
              break;
          }
      }
  }

  if (targetNormalized) {
    const targetEl = games[targetNormalized].element;
    if (!isActive(targetEl)) {
        console.log(`[NCAA Switcher] Switching audio to: ${targetNormalized}`);
        commercialState.delete(targetNormalized);
        const clickTarget = targetEl.querySelector('video') || targetEl.querySelector('._videoContainer_q31gh_123') || targetEl;
        clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  }
}

setInterval(switchAudio, 2000);
setInterval(() => {
    updateGameList();
    updateOverlays();
}, 1000);
