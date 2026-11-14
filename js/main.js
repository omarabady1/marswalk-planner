/* MarsWalk Planner — plans the safest walking route on Mount Sharp.
 *
 * Flow: load web/data/* → map + layers → user places start + targets
 *       → A* on cost_grid.json for every pair of points → best visiting order
 *       → go/no-go poll, stats, comparison with the other end of the priority slider
 *       → optional playback (astronaut walks the route with a helmet display) and 3D view.
 *
 * Where things live (all in web/js/):
 *   routing/     the search: grid, A*, best order, walk stats (no page code, unit-tested in web/tests/)
 *   state.js     shared state, settings, assumptions, formatting
 *   data.js      loading web/data/*
 *   map.js       Leaflet map and layers        points.js    start + target points
 *   route.js     re-planning on every change   routeDraw.js route lanes and arrows on the map
 *   summary.js   go/no-go poll + numbers       charts.js    elevation + temperature charts
 *   weather.js   REMS weather                  playback.js  the walk playback and helmet display
 *   photos.js    Curiosity + orbital photos    curiosity.js Curiosity's stops on the map
 *   view3dBridge.js  map / 3D / astronaut view switch, and keeping the 3D view in step
 *   main.js      (this file) start-up and the buttons
 */
import { state, $, setStatus, PLAY_SECONDS_PER_HOUR, REDUCED_MOTION, priority, playSpeed } from './state.js';
import { loadAll } from './data.js';
import { buildGrid } from './routing/grid.js';
import { setupMap } from './map.js';
import { latestStop } from './curiosity.js';
import { refreshPointList, removePoint, clearPoints } from './points.js';
import { planRoute } from './route.js';
import { renderSummary } from './summary.js';
import { setupWeather, renderWeather } from './weather.js';
import { play, startPlayback, stopPlayback, setPanels, scrubTo } from './playback.js';
import { showView } from './view3dBridge.js';

async function init() {
  setupBriefing();
  const mb = (b) => (b / 1e6).toFixed(1);
  const showProgress = ({ loaded, total }) => {
    const pct = total ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
    $('loadFill').style.width = `${pct}%`;
    $('loadText').textContent = total ? `Downloading Mars data… ${mb(loaded)} of ${mb(total)} MB (${pct}%)` : 'Downloading Mars data…';
  };
  try {
    const { config, costGrid, weather, curiosity } = await loadAll(showProgress);
    state.config = config;
    state.grid = buildGrid(costGrid, config.bounds);
    state.weather = weather || [];
    state.curiosity = curiosity;
  } catch (err) {
    setStatus(err.message, true);
    $('loadText').textContent = err.message;
    $('loadText').classList.add('error');
    $('btnBrief').textContent = 'Could not load';
    return;
  }
  $('briefLoad').hidden = true;
  $('btnBrief').disabled = false;
  $('btnBrief').textContent = 'Start planning';
  $('btnBrief').focus();
  const { grid, config } = state;
  setupMap();
  setupControls();
  setupWeather();
  refreshPointList();
  $('bBlocked').textContent = `${grid.blockedPct.toFixed(0)}%`;
  if (state.curiosity) $('bLastSol').textContent = latestStop().properties.sol;
  $('bSize').textContent = `${config.size_m / 1000} × ${config.size_m / 1000} km`;
  setStatus(`Ready. ${grid.blockedPct.toFixed(0)}% of the area is too steep to walk.`);
  showView('3d');   // start on the Mars globe (the 3D view opens there); click Gale Crater to fly down
}

function setupBriefing() {
  $('btnBrief').addEventListener('click', () => {
    const b = $('briefing');
    if (REDUCED_MOTION) { b.hidden = true; return; }
    b.classList.add('leaving');
    setTimeout(() => { b.hidden = true; }, 350);
  });
}

// ---------------------------------------------------------------------------
// Buttons & inputs
// ---------------------------------------------------------------------------
function setupControls() {
  $('btnUndo').addEventListener('click', () => { if (state.points.length) removePoint(state.points[state.points.length - 1]); });
  $('btnClear').addEventListener('click', () => {
    clearPoints();
    setStatus('Cleared. Click the map to place a new start.');
  });
  // These change which route is best → re-plan
  ['optReturn', 'optOrder'].forEach((id) => $(id).addEventListener('change', () => planRoute()));

  // Route priority slider: re-plan live while dragging (no draw-in animation)
  const describe = () => {
    const p = priority();
    $('priorityText').textContent = p === 100 ? 'Safest: stays on gentle, firm ground even if the walk is longer.'
      : p === 0 ? 'Fastest: the quickest walk that avoids cliffs, even over steeper or sandier ground.'
      : `${p}% safety: a balance between a quick walk and gentle, firm ground.`;
  };
  $('priority').addEventListener('input', () => { describe(); planRoute({ animate: false }); });

  // These only change the numbers → refresh the summary (and the playback timeline)
  ['inStart', 'inStop', 'inSuit'].forEach((id) => $(id).addEventListener('input', () => { stopPlayback(true); renderSummary(); }));
  $('inSol').addEventListener('change', () => { renderWeather(); renderSummary(); });

  // Playback
  $('btnPlay').addEventListener('click', () => {
    if (play.playing) { stopPlayback(); return; }
    if (state.activeView === '3d') showView('pov');   // walks from the 3D view are seen at eye level
    startPlayback();
  });
  $('btnEnd').addEventListener('click', () => stopPlayback(true));
  $('btnPanels').addEventListener('click', () => setPanels(document.body.classList.contains('panels-hidden')));
  const showSpeed = () => {
    const s = playSpeed();
    $('speedOut').textContent = `${s}×`;
    $('speed').setAttribute('aria-valuetext', `${s} times, one hour outside in ${Math.round(PLAY_SECONDS_PER_HOUR / s)} seconds`);
  };
  $('speed').addEventListener('input', showSpeed);   // takes effect immediately, even mid-walk
  showSpeed();
  $('scrub').addEventListener('input', () => scrubTo(Number($('scrub').value)));

  $('btnMap').addEventListener('click', () => showView('map'));
  $('btn3D').addEventListener('click', () => showView('3d'));
  $('btnPOV').addEventListener('click', () => showView('pov'));
}

init();
