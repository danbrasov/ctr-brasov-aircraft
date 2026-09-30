export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const station = 'LRBV';
  const now = new Date();
  const from = new Date(now.getTime() - 8 * 3600 * 1000);
  const to = new Date(now.getTime() + 24 * 3600 * 1000);

  const q = new URLSearchParams({
    station,
    network: 'RO__ASOS',
    year1: String(from.getUTCFullYear()),
    month1: String(from.getUTCMonth() + 1),
    day1: String(from.getUTCDate()),
    year2: String(to.getUTCFullYear()),
    month2: String(to.getUTCMonth() + 1),
    day2: String(to.getUTCDate()),
    tz: 'Etc/UTC',
    format: 'onlycomma',
    latlon: 'yes',
    elev: 'no',
    missing: 'M',
    trace: 'T',
    direct: 'no'
  });
  for (const v of ['drct','sknt','gust','tmpf']) q.append('data', v);
  q.append('report_type', '3');
  q.append('report_type', '4');

  try {
    const url = 'https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?' + q.toString();
    const r = await fetch(url, {
      headers: {
        'Accept': 'text/plain',
        'User-Agent': 'ctr-brasov-aircraft/1.0'
      }
    });
    if (!r.ok) return res.status(502).json({ok:false,error:'IEM HTTP '+r.status});

    const txt = await r.text();
    const lines = txt.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return res.status(502).json({ok:false,error:'No LRBV observations'});

    const header = lines[0].split(',').map(x => x.trim());
    const idx = Object.fromEntries(header.map((x,i)=>[x,i]));
    const val = (cols, key) => {
      const i = idx[key];
      if (i == null) return null;
      const s = (cols[i] ?? '').trim();
      return !s || s === 'M' ? null : s;
    };
    const num = x => x == null || !Number.isFinite(+x) ? null : +x;
    const points = [];

    for (const line of lines.slice(1)) {
      const c = line.split(',');
      const valid = val(c,'valid');
      if (!valid) continue;
      const t = Date.parse(valid.replace(' ','T') + 'Z');
      if (!Number.isFinite(t)) continue;
      const drct = num(val(c,'drct'));
      const sknt = num(val(c,'sknt'));
      const gust = num(val(c,'gust'));
      const tmpf = num(val(c,'tmpf'));
      points.push({
        t,
        dir: drct,
        windKmh: sknt == null ? null : Math.round(sknt * 1.852 * 10) / 10,
        gustKmh: gust == null ? null : Math.round(gust * 1.852 * 10) / 10,
        tempC: tmpf == null ? null : Math.round(((tmpf - 32) * 5 / 9) * 10) / 10
      });
    }

    points.sort((a,b)=>a.t-b.t);
    const cutoff = now.getTime() - 4 * 3600 * 1000;
    const history = points.filter(p => p.t >= cutoff && p.t <= now.getTime() + 10*60*1000);
    const current = history[history.length-1] || points[points.length-1] || null;

    res.setHeader('Cache-Control','s-maxage=120, stale-while-revalidate=180');
    return res.status(200).json({
      ok: true,
      station: {
        id: 'LRBV',
        name: 'Aeroport Brașov-Ghimbav',
        lat: 45.7016,
        lon: 25.52,
        elevationM: 532
      },
      current,
      history,
      source: 'Iowa Environmental Mesonet / METAR LRBV'
    });
  } catch (err) {
    return res.status(500).json({ok:false,error:String(err)});
  }
}
