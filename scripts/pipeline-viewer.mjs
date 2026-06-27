// Genera .claude/artifacts/viewer.html: una vista legible de los artifacts JSON
// del pipeline de agentes (PO/Designer/QA) + el commit del Developer si existe.
// node scripts/pipeline-viewer.mjs   (no requiere dependencias nuevas)

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ARTIFACTS_ROOT = join(REPO_ROOT, '.claude', 'artifacts')
const OUT_FILE = join(ARTIFACTS_ROOT, 'viewer.html')

// Cada feature tiene su propia carpeta (.claude/artifacts/<feature>/) para no pisar
// los artifacts de otras features con el mismo nombre fijo (po-output.json, etc).
// Por defecto se infiere de la rama actual (feature/<nombre>-ui -> <nombre>);
// node scripts/pipeline-viewer.mjs <feature> lo overridea.
function inferFeature() {
  const arg = process.argv[2]
  if (arg) return arg
  try {
    const branch = execFileSync('git', ['branch', '--show-current'], { cwd: REPO_ROOT }).toString().trim()
    const m = branch.match(/^feature\/(.+?)(-ui)?$/)
    if (m) return m[1]
  } catch {}
  return null
}

const FEATURE = inferFeature()
if (!FEATURE) {
  console.error('No pude inferir la feature desde la rama actual. Usá: node scripts/pipeline-viewer.mjs <feature>')
  process.exit(1)
}
const ARTIFACTS_DIR = join(ARTIFACTS_ROOT, FEATURE)

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function chip(text) {
  return `<span class="chip">${esc(text)}</span>`
}

function readJsonIfExists(name) {
  const path = join(ARTIFACTS_DIR, `${name}.json`)
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8'))
}

function gitCommitFor(tag) {
  try {
    const hash = execFileSync('git', ['log', `--grep=^\\[${tag}\\]`, '-1', '--format=%H'], { cwd: REPO_ROOT }).toString().trim()
    if (!hash) return null
    const subject = execFileSync('git', ['log', '-1', '--format=%s', hash], { cwd: REPO_ROOT }).toString().trim()
    const stat = execFileSync('git', ['show', '--stat', '--format=', hash], { cwd: REPO_ROOT }).toString().trim()
    return { hash: hash.slice(0, 7), subject, stat }
  } catch {
    return null
  }
}

function commitFooter(tag) {
  const c = gitCommitFor(tag)
  if (!c) return ''
  return `<div class="commit-footer">commit <code>${esc(c.hash)}</code> — ${esc(c.subject)}<pre>${esc(c.stat)}</pre></div>`
}

function pendingPanel(label) {
  return `<div class="pending">Pendiente — todavía no corrió este agente.</div>`
}

// ── PO ───────────────────────────────────────────────────────────────────

function renderPO(po) {
  if (!po) return pendingPanel('PO')
  const stories = (po.user_stories ?? []).map(s => `
    <div class="card">
      <div class="card-head"><span class="badge">${esc(s.id)}</span></div>
      <p><b>Como</b> ${esc(s.as_a)}, <b>quiero</b> ${esc(s.i_want)} <b>para</b> ${esc(s.so_that)}</p>
      <ul class="criteria">
        ${(s.acceptance_criteria ?? []).map(c => `<li>✓ ${esc(c)}</li>`).join('')}
      </ul>
    </div>`).join('')

  const fieldsRows = (po.form_fields ?? []).map(f => `
    <tr>
      <td><code>${esc(f.name)}</code></td>
      <td>${esc(f.type)}</td>
      <td>${f.required ? '<span class="yes">sí</span>' : '<span class="no">no</span>'}</td>
      <td>${esc(f.validation)}</td>
      <td class="muted">${esc(f.source_in_bot)}</td>
    </tr>`).join('')

  return `
    <h2>User stories</h2>
    ${stories || '<p class="muted">Sin user stories.</p>'}

    <h2>Campos del formulario</h2>
    <table>
      <thead><tr><th>Campo</th><th>Tipo</th><th>Requerido</th><th>Validación</th><th>Origen en el bot</th></tr></thead>
      <tbody>${fieldsRows}</tbody>
    </table>

    <h2>Reglas de negocio</h2>
    <ul>${(po.business_rules ?? []).map(r => `<li>${esc(r)}</li>`).join('')}</ul>

    <h2>Fuera de alcance</h2>
    <ul class="muted-list">${(po.out_of_scope ?? []).map(r => `<li>${esc(r)}</li>`).join('')}</ul>

    ${commitFooter('agent-po')}
  `
}

// ── Designer ─────────────────────────────────────────────────────────────

function renderDesigner(d) {
  if (!d) return pendingPanel('Designer')

  const flow = (d.flow ?? []).map(s => `
    <div class="step">
      <div class="step-num">${esc(s.step)}</div>
      <div class="step-body">
        <div class="step-screen">${esc(s.screen)}</div>
        ${(s.fields_shown ?? []).length ? `<div class="chips">${(s.fields_shown).map(chip).join('')}</div>` : ''}
        <p class="muted">${esc(s.user_action)}</p>
        <p class="next">→ siguiente: ${esc(s.next_step)}</p>
      </div>
    </div>`).join('')

  const components = (d.component_tree ?? []).map(c => `
    <div class="card">
      <div class="card-head"><code class="comp-name">${esc(c.component)}</code></div>
      ${c.children?.length ? `<p class="muted">hijos: ${c.children.map(esc).join(', ')}</p>` : ''}
      ${c.props?.length ? `<div class="chips">${c.props.map(p => chip('prop: ' + p)).join('')}</div>` : ''}
      ${c.states?.length ? `<div class="chips">${c.states.map(s => chip('estado: ' + s)).join('')}</div>` : ''}
    </div>`).join('')

  const validations = Object.entries(d.validations_per_step ?? {}).map(([step, rules]) => `
    <div class="card">
      <div class="card-head"><span class="badge">${esc(step)}</span></div>
      <ul>${rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
    </div>`).join('')

  return `
    <h2>Flujo</h2>
    <div class="flow">${flow}</div>

    <h2>Árbol de componentes</h2>
    ${components}

    <h2>Validaciones por paso</h2>
    ${validations}

    ${commitFooter('agent-designer')}
  `
}

// ── QA ───────────────────────────────────────────────────────────────────

function renderQA(qa) {
  if (!qa) return pendingPanel('QA')

  const rows = (qa.results ?? []).map(r => `
    <tr class="${r.status === 'FAIL' ? 'row-fail' : 'row-pass'}">
      <td><code>${esc(r.story_id)}</code></td>
      <td>${r.status === 'FAIL' ? '<span class="no">FAIL</span>' : '<span class="yes">PASS</span>'}</td>
      <td>${esc(r.issue ?? '—')}</td>
      <td>${esc(r.fix_suggestion ?? '—')}</td>
    </tr>`).join('')

  return `
    <h2>Resumen: <span class="${qa.summary === 'FAIL' ? 'no' : 'yes'}">${esc(qa.summary)}</span></h2>

    <table>
      <thead><tr><th>Story</th><th>Estado</th><th>Issue</th><th>Fix sugerido</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <h2>TODOs encontrados en el código</h2>
    <ul>${(qa.todos_found_in_code ?? []).map(t => `<li>${esc(t)}</li>`).join('') || '<li class="muted">Ninguno.</li>'}</ul>

    <h2>Faltantes críticos</h2>
    <ul class="${(qa.critical_missing ?? []).length ? 'critical' : ''}">${(qa.critical_missing ?? []).map(t => `<li>${esc(t)}</li>`).join('') || '<li class="muted">Ninguno.</li>'}</ul>

    ${commitFooter('agent-qa')}
  `
}

// ── Developer (sin JSON, solo código + commit) ────────────────────────────

function renderDeveloper() {
  const c = gitCommitFor('agent-dev')
  if (!c) return pendingPanel('Developer')
  return `
    <h2>Commit del Developer</h2>
    <div class="commit-footer">commit <code>${esc(c.hash)}</code> — ${esc(c.subject)}<pre>${esc(c.stat)}</pre></div>
    <p class="muted">Este agente no produce un artifact JSON: revisá los archivos listados arriba directamente en el editor o con <code>git show ${esc(c.hash)}</code>.</p>
  `
}

// ── Build ────────────────────────────────────────────────────────────────

const po = readJsonIfExists('po-output')
const designer = readJsonIfExists('designer-output')
const qa = readJsonIfExists('qa-output')

const tabs = [
  { id: 'po', label: '1. Product Owner', html: renderPO(po) },
  { id: 'designer', label: '2. Designer', html: renderDesigner(designer) },
  { id: 'dev', label: '3. Developer', html: renderDeveloper() },
  { id: 'qa', label: '4. QA', html: renderQA(qa) },
]

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Pipeline de agentes — ${esc(FEATURE)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, "Segoe UI", sans-serif; background: #f8fafc; color: #1e293b; margin: 0; }
  header { background: #fff; border-bottom: 1px solid #e2e8f0; padding: 16px 24px; display: flex; align-items: center; gap: 16px; }
  header h1 { font-size: 16px; margin: 0; font-weight: 600; }
  header .gen-at { font-size: 12px; color: #94a3b8; margin-left: auto; }
  nav { display: flex; gap: 4px; padding: 12px 24px 0; background: #fff; border-bottom: 1px solid #e2e8f0; }
  nav button { border: none; background: none; padding: 10px 16px; font-size: 13px; font-weight: 500; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; }
  nav button.active { color: #4f46e5; border-bottom-color: #4f46e5; }
  main { max-width: 880px; margin: 0 auto; padding: 24px; }
  .panel { display: none; }
  .panel.active { display: block; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .03em; color: #94a3b8; margin: 28px 0 10px; }
  h2:first-child { margin-top: 0; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; }
  .card-head { margin-bottom: 6px; }
  .badge { display: inline-block; background: #eef2ff; color: #4338ca; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px; }
  .comp-name { font-size: 13px; font-weight: 600; }
  .criteria { margin: 8px 0 0; padding-left: 18px; font-size: 13px; color: #475569; }
  .criteria li { margin-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
  th { text-align: left; background: #f1f5f9; color: #64748b; font-size: 11px; text-transform: uppercase; padding: 8px 10px; }
  td { padding: 8px 10px; border-top: 1px solid #f1f5f9; vertical-align: top; }
  code { font-family: ui-monospace, monospace; font-size: 12px; background: #f1f5f9; padding: 1px 5px; border-radius: 4px; }
  .yes { color: #059669; font-weight: 600; }
  .no { color: #dc2626; font-weight: 600; }
  .muted { color: #94a3b8; font-size: 12px; }
  .muted-list { color: #94a3b8; font-size: 13px; padding-left: 18px; }
  ul { padding-left: 18px; font-size: 13px; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0; }
  .chip { background: #f1f5f9; color: #475569; font-size: 11px; padding: 2px 8px; border-radius: 999px; }
  .flow { display: flex; flex-direction: column; gap: 0; }
  .step { display: flex; gap: 12px; padding: 10px 0; border-left: 2px solid #e2e8f0; margin-left: 10px; padding-left: 18px; position: relative; }
  .step-num { position: absolute; left: -11px; top: 10px; width: 20px; height: 20px; border-radius: 999px; background: #4f46e5; color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  .step-screen { font-weight: 600; font-size: 13px; }
  .next { font-size: 12px; color: #4f46e5; margin: 4px 0 0; }
  .pending { color: #94a3b8; font-style: italic; padding: 40px 0; text-align: center; }
  .commit-footer { margin-top: 24px; padding-top: 12px; border-top: 1px dashed #e2e8f0; font-size: 12px; color: #94a3b8; }
  .commit-footer pre { font-size: 11px; color: #64748b; background: #f8fafc; padding: 8px; border-radius: 6px; overflow-x: auto; margin-top: 6px; }
  .row-fail td { background: #fef2f2; }
  .critical { color: #dc2626; }
</style>
</head>
<body>
<header>
  <h1>Pipeline de agentes — ${esc(FEATURE)}</h1>
  <span class="gen-at">generado ${esc(new Date().toLocaleString('es-AR'))}</span>
</header>
<nav>
  ${tabs.map((t, i) => `<button data-tab="${t.id}" class="${i === 0 ? 'active' : ''}">${esc(t.label)}</button>`).join('')}
</nav>
<main>
  ${tabs.map((t, i) => `<section class="panel ${i === 0 ? 'active' : ''}" id="panel-${t.id}">${t.html}</section>`).join('')}
</main>
<script>
  document.querySelectorAll('nav button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    });
  });
</script>
</body>
</html>`

writeFileSync(OUT_FILE, html)
console.log(`Visor generado: ${OUT_FILE}`)
