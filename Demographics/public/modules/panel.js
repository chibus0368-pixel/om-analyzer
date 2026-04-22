/**
 * Demographics panel - radius selector, legend, metrics table, color-by chips.
 * Pure render / event emitters; no Leaflet or fetch here.
 */
import { METRICS } from './metrics-config.js';
import { fmtMoney } from './format.js';

export function renderPanel(root, state, handlers) {
  const { radii, rings, radius, colorKey, colorRange } = state;
  const activeMetric = METRICS.find(m => m.colorKey === colorKey) || METRICS[1];

  root.innerHTML = `
    <div class="panel-section">
      <div class="panel-label">RADIUS</div>
      <div class="radius-row" id="p-radius">
        ${radii
          .map(
            r =>
              `<button class="chip ${r === radius ? 'active' : ''}" data-r="${r}">${r} mi</button>`
          )
          .join('')}
      </div>
    </div>

    <div class="panel-section">
      <div class="panel-label">COLOR: ${activeMetric.colorLabel.toUpperCase()}</div>
      <div class="legend-bar"></div>
      <div class="legend-labels">
        <span>${formatLegend(colorRange[0], activeMetric)}</span>
        <span>${formatLegend(colorRange[1], activeMetric)}</span>
      </div>
    </div>

    <div class="panel-section">
      <table class="metrics">
        <thead>
          <tr>
            <th>Metric</th>
            ${radii.map(r => `<th>${r} mi</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${METRICS.map(
            m => `
            <tr>
              <td>${m.label}</td>
              ${radii
                .map(r => {
                  const v = rings?.[r]?.[m.key];
                  return `<td>${m.fmt(v)}</td>`;
                })
                .join('')}
            </tr>`
          ).join('')}
        </tbody>
      </table>
    </div>

    <div class="panel-section">
      <div class="panel-label">COLOR BY</div>
      <div class="color-by-grid" id="p-color">
        ${METRICS.filter(m => m.colorKey)
          .map(
            m =>
              `<button class="chip ${m.colorKey === colorKey ? 'active' : ''}" data-k="${m.colorKey}">${m.colorLabel}</button>`
          )
          .join('')}
      </div>
    </div>
  `;

  root.querySelectorAll('#p-radius .chip').forEach(btn =>
    btn.addEventListener('click', () => {
      handlers.onRadius(Number(btn.dataset.r));
    })
  );
  root.querySelectorAll('#p-color .chip').forEach(btn =>
    btn.addEventListener('click', () => {
      handlers.onColor(btn.dataset.k);
    })
  );
}

function formatLegend(v, metric) {
  if (v == null) return '-';
  if (metric.colorKey === 'medIncome' || metric.colorKey === 'homeValue') {
    return fmtMoney(v);
  }
  if (metric.colorKey === 'popDensity' || metric.colorKey === 'households' || metric.colorKey === 'daytimeWorkers') {
    return Math.round(v).toLocaleString();
  }
  return (Math.round(v * 10) / 10).toString();
}
