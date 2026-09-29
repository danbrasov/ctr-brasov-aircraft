export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const LAT = 45.6579;
  const LON = 25.6012;
  const NM = 54; // ~100 km

  try {
    const upstream = await fetch(`https://opendata.adsb.fi/api/v3/lat/${LAT}/lon/${LON}/dist/${NM}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ctr-brasov-aircraft/1.0'
      }
    });

    if (!upstream.ok) {
      return res.status(502).json({ ok: false, error: `adsb.fi HTTP ${upstream.status}` });
    }

    const data = await upstream.json();
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=15');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
