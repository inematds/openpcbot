/** Self-contained queue panel. Polls /api/video-jobs and renders a table. */
export function getVideoDashboardHtml(token: string): string {
  return `<!DOCTYPE html>
<html lang="pt-br"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fila de Vídeos — OpenPCBot</title>
<style>
  body { font-family: system-ui, sans-serif; background:#0D1321; color:#F0EBD8; margin:0; padding:24px; }
  h1 { color:#FFC300; font-size:20px; }
  table { width:100%; border-collapse:collapse; margin-top:16px; }
  th,td { text-align:left; padding:8px 10px; border-bottom:1px solid #3E5C76; font-size:14px; }
  th { color:#748CAB; font-weight:600; }
  .badge { padding:2px 8px; border-radius:10px; font-size:12px; }
  .queued{background:#3E5C76}.running{background:#FFC300;color:#0D1321}.done{background:#2EC4B6;color:#0D1321}
  .failed{background:#b00020}.canceled{background:#555}
  button { background:#1D2D44; color:#F0EBD8; border:1px solid #3E5C76; border-radius:6px; padding:4px 10px; cursor:pointer; }
  a { color:#FFC300; }
</style></head><body>
<h1>📋 Fila de Vídeos</h1>
<table><thead><tr><th>#</th><th>Skill</th><th>Entrada</th><th>Status</th><th>Resultado</th><th></th></tr></thead>
<tbody id="rows"><tr><td colspan="6">carregando…</td></tr></tbody></table>
<script>
const TOKEN = ${JSON.stringify(token)};
async function load() {
  const r = await fetch('/api/video-jobs?token=' + encodeURIComponent(TOKEN));
  const { jobs } = await r.json();
  document.getElementById('rows').innerHTML = jobs.map(function(j){
    var inp = (j.input||'').length > 50 ? j.input.slice(0,50)+'…' : (j.input||'');
    var res = j.result_path ? '<a href="#">'+j.result_path+'</a>' : (j.error ? ('⚠ '+j.error) : '—');
    var btn = j.status === 'queued' ? '<button onclick="cancelJob('+j.id+')">cancelar</button>' : '';
    return '<tr><td>#'+j.id+'</td><td>'+j.skill+'</td><td>'+inp+'</td>'
      + '<td><span class="badge '+j.status+'">'+j.status+'</span></td><td>'+res+'</td><td>'+btn+'</td></tr>';
  }).join('') || '<tr><td colspan="6">Sem jobs ainda.</td></tr>';
}
async function cancelJob(id){
  await fetch('/api/video-jobs/'+id+'/cancel?token='+encodeURIComponent(TOKEN), {method:'POST'});
  load();
}
load(); setInterval(load, 5000);
</script></body></html>`;
}
