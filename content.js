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
    if (changes.ranking) ranking = changes.ranking.newValue;
    if (changes.enabled) enabled = changes.enabled.newValue;
  }
});

/**
 * Maps the 4-game layout to specific elements on the page.
 * The user mentioned top-left, top-right, bottom-left, bottom-right.
 * Based on common grid layouts and the provided HTML snippet, we need to find
 * how the site orders these in the DOM.
 */
function getGameElements() {
  // According to the user, there are 4 games in a 2x2 grid.
  // The provided HTML shows a container like:
  // <div class="_p3_1o8ii_199 _player_1o8ii_112 _primary_1o8ii_119" data-player-id="205">
  // We filter by visibility and size to avoid hidden elements or small icons.
  const players = Array.from(document.querySelectorAll('div[data-player-id]'))
    .filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 100 && rect.height > 100;
    });

  if (players.length === 0) return null;

  // Sort them by their position on the screen to reliably map to the labels
  const sortedByPos = players.sort((a, b) => {
    const rectA = a.getBoundingClientRect();
    const rectB = b.getBoundingClientRect();
    // Compare Y first (top vs bottom) with a threshold, then X (left vs right)
    if (Math.abs(rectA.top - rectB.top) > 50) {
      return rectA.top - rectB.top;
    }
    return rectA.left - rectB.left;
  });

  const games = {};
  if (sortedByPos[0]) games.topLeft = sortedByPos[0];
  if (sortedByPos[1]) games.topRight = sortedByPos[1];
  if (sortedByPos[2]) games.bottomLeft = sortedByPos[2];
  if (sortedByPos[3]) games.bottomRight = sortedByPos[3];

  return games;
}

function isOnCommercial(playerElement) {
  // Look for "Live coverage will return in:"
  // Based on the snippet: <span class="mml-caption-1">Live coverage will return in: 1:58</span>
  const textContent = playerElement.innerText || "";
  return textContent.includes("Live coverage will return in:");
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
