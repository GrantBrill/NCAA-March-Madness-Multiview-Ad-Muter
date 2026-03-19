let ranking = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
let enabled = false;

// Load initial state
chrome.storage.sync.get(['ranking', 'enabled'], (data) => {
  if (data.ranking) ranking = data.ranking;
  if (data.enabled !== undefined) enabled = data.enabled;
});

// Listen for changes in storage
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    if (changes.ranking) {
      ranking = changes.ranking.newValue;
      console.log("[NCAA Switcher] Ranking updated:", ranking);
    }
    if (changes.enabled) {
      enabled = changes.enabled.newValue;
      console.log("[NCAA Switcher] Switcher " + (enabled ? "ENABLED" : "DISABLED"));
    }
  }
});

/**
 * Maps the multiview layout to specific quadrants.
 * Handles 2, 3, and 4 game layouts by identifying which quadrant a game's center falls into.
 */
function getGameElements() {
  const players = Array.from(document.querySelectorAll('div[data-player-id]'))
    .filter(el => {
      const rect = el.getBoundingClientRect();
      // Only consider elements that are large enough to be actual video players
      return rect.width > 100 && rect.height > 100;
    });

  if (players.length === 0) return null;

  // Determine the bounding box of the entire multiview area
  let minTop = Infinity, maxBottom = -Infinity, minLeft = Infinity, maxRight = -Infinity;
  players.forEach(p => {
    const r = p.getBoundingClientRect();
    if (r.top < minTop) minTop = r.top;
    if (r.bottom > maxBottom) maxBottom = r.bottom;
    if (r.left < minLeft) minLeft = r.left;
    if (r.right > maxRight) maxRight = r.right;
  });

  const midY = (minTop + maxBottom) / 2;
  const midX = (minLeft + maxRight) / 2;

  const games = {};
  players.forEach(p => {
    const r = p.getBoundingClientRect();
    const cy = (r.top + r.bottom) / 2;
    const cx = (r.left + r.right) / 2;

    // Use a small epsilon (10px) to handle alignment edge cases
    // and favor 'top' and 'Left' for games that might span the center.
    let vertical = (cy < midY + 10) ? 'top' : 'bottom';
    let horizontal = (cx < midX + 10) ? 'Left' : 'Right';

    const slot = vertical + horizontal;
    // In case of multiple games in a quadrant (shouldn't happen), first one found wins
    if (!games[slot]) {
      games[slot] = p;
    }
  });

  console.log(`[NCAA Switcher] Found ${players.length} games. Mapped slots:`, Object.keys(games));
  return games;
}

const commercialState = new Map(); // playerId -> expirationTimestamp

function isOnCommercial(playerElement) {
  const playerId = playerElement.getAttribute('data-player-id');
  const text = playerElement.innerText || "";
  const indicator = "Live coverage will return in:";

  if (text.toLowerCase().includes(indicator.toLowerCase())) {
    let duration = 30000; // Default 30s if we can't parse time
    const match = text.match(/Live coverage will return in:\s*(\d+):(\d+)/i);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      duration = ((minutes * 60 + seconds) + 2) * 1000; // +2s buffer as requested
    }

    const expiration = Date.now() + duration;
    commercialState.set(playerId, expiration);
    console.log(`[NCAA Switcher] Game ${playerId} detected on commercial. Locked for ${Math.round(duration/1000)}s`);
    return true;
  }

  // Check if we have a cached commercial state
  const expiration = commercialState.get(playerId);
  if (expiration) {
    if (Date.now() < expiration) {
      // If it's active and we DON'T see the text, it might have come back early
      if (isActive(playerElement)) {
        commercialState.delete(playerId);
        console.log(`[NCAA Switcher] Game ${playerId} returned early or user manually switched to it.`);
        return false;
      }
      return true;
    } else {
      // Expiration reached
      commercialState.delete(playerId);
      console.log(`[NCAA Switcher] Commercial lock expired for Game ${playerId}. Checking if it's back...`);
    }
  }

  return false;
}

function isActive(playerElement) {
  // The site likely marks the active audio with a class or by checking which one is unmuted.
  // In the snippet: <button aria-label="Mute" class="_iconButton_10oxs_121 _volumeOn_10oxs_178" ...>
  // If we can't reliably find it, we might just have to click the one we want.
  // However, the user said "switches the audio (by clicking)".
  // Let's look for a class that indicates focus.
  return playerElement.classList.contains('_primary_1o8ii_119');
}

function switchAudio() {
  if (!enabled) return;

  console.log("[NCAA Switcher] Checking audio focus...");
  const games = getGameElements();
  if (!games) return;

  // Find the highest ranked game that is NOT on commercial
  let targetGame = null;
  for (const id of ranking) {
    const gameEl = games[id];
    if (gameEl && !isOnCommercial(gameEl)) {
      targetGame = gameEl;
      break;
    }
  }

  // If we found a game and it's not already the active one, click it.
  if (targetGame && !isActive(targetGame)) {
    console.log("Switching audio to:", targetGame);
    // User said "just anywhere on the box that shows the video"
    // We'll click a safe area within the container.
    // Try specifically the video element first if possible, or the container.
    const clickTarget = targetGame.querySelector('video') || targetGame.querySelector('._videoContainer_q31gh_123') || targetGame;
    clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }
}

// Run the check frequently
setInterval(switchAudio, 2000);
