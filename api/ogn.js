export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Approx. 100 km box around Brasov. OGN returns only currently online aircraft (a=0).
  const bounds = { north: 46.56, south: 44.75, east: 26.90, west: 24.30 };
  const url =
    'https://live.glidernet.org/lxml.php?a=0' +
    '&b=' + bounds.north +
    '&c=' + bounds.south +
    '&d=' + bounds.east +
    '&e=' + bounds.west +
    '&z=-180';

  try {
    const r = await fetch(url, {
      headers: {
        'Accept': 'application/xml,text/xml,*/*',
        'User-Agent': 'ctr-brasov-aircraft/1.0'
      }
    });
    if (!r.ok) {
      return res.status(502).json({ ok: false, error: 'OGN HTTP ' + r.status });
    }

    const xml = await r.text();
    const gliders = [];
    const re = /<m\b[^>]*\ba="([^"]*)"[^>]*\/?\s*>/g;
    let m;

    while ((m = re.exec(xml))) {
      const t = m[1].split(',');
      if (t.length < 14) continue;

      // OGN Live type 1 = Glider/MotorGlider.
      const type = Number(t[10]);
      if (type !== 1) continue;

      const lat = Number(t[0]);
      const lon = Number(t[1]);
      const altM = Number(t[4]);
      const track = Number(t[7]);
      const speedKmh = Number(t[8]);
      const varioMs = Number(t[9]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      gliders.push({
        lat,
        lon,
        cn: t[2] || null,
        reg: t[3] || null,
        altM: Number.isFinite(altM) ? altM : null,
        time: t[5] || null,
        ageS: Number.isFinite(Number(t[6])) ? Number(t[6]) : null,
        track: Number.isFinite(track) ? track : null,
        speedKmh: Number.isFinite(speedKmh) ? speedKmh : null,
        varioMs: Number.isFinite(varioMs) ? varioMs : null,
        type,
        receiver: t[11] || null,
        deviceId: t[12] && t[12] !== '0' ? t[12] : null,
        id: t[13] || t[3] || t[2] || (lat + ',' + lon)
      });
    }

    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=10');
    return res.status(200).json({
      ok: true,
      count: gliders.length,
      gliders,
      bounds,
      source: 'Open Glider Network / live.glidernet.org'
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
