export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const stationId = '15';
  const base = 'https://meteo.paragliding-romania.ro/';

  const strip = s => String(s || '').replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/gi,' ')
    .replace(/&deg;/gi,'°')
    .replace(/&#176;/gi,'°')
    .replace(/&amp;/gi,'&')
    .replace(/\s+/g,' ')
    .trim();

  const num = s => {
    if (s == null) return null;
    const m = String(s).replace(',','.').match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
  };

  try {
    const qs = '?station_id=' + stationId + '&_=' + Date.now();
    const [wr,tr,br] = await Promise.all([
      fetch(base+'windspeeddirection.php'+qs,{headers:{'User-Agent':'ctr-brasov-aircraft/1.0'}}),
      fetch(base+'temperature.php'+qs,{headers:{'User-Agent':'ctr-brasov-aircraft/1.0'}}),
      fetch(base+'barometer.php'+qs,{headers:{'User-Agent':'ctr-brasov-aircraft/1.0'}})
    ]);
    if (!wr.ok || !tr.ok || !br.ok) {
      return res.status(502).json({ok:false,error:'Paragliding meteo upstream HTTP '+[wr.status,tr.status,br.status].join('/')});
    }

    const [wraw,traw,braw] = await Promise.all([wr.text(),tr.text(),br.text()]);
    const w = strip(wraw), t = strip(traw), b = strip(braw);

    const time = (w.match(/\b\d{2}:\d{2}:\d{2}\b/)||t.match(/\b\d{2}:\d{2}:\d{2}\b/)||b.match(/\b\d{2}:\d{2}:\d{2}\b/)||[])[0] || null;

    let dir = null;
    const dirMatch = w.match(/\b(\d{1,3})°/);
    if (dirMatch) dir = Number(dirMatch[1]);

    const kmh = [...w.matchAll(/(-?\d+(?:[\.,]\d+)?)\s*km\/h/gi)].map(m=>Number(m[1].replace(',','.')));
    const windKmh = kmh.length ? kmh[0] : null;
    const gustKmh = kmh.length > 1 ? kmh[1] : null;

    let tempC = null;
    const tcands = [...t.matchAll(/(-?\d+(?:[\.,]\d+)?)\s*°?C\b/gi)].map(m=>Number(m[1].replace(',','.')));
    if (tcands.length) tempC = tcands[0];

    let pressureHpa = null;
    const pcands = [...b.matchAll(/(-?\d+(?:[\.,]\d+)?)\s*hPa\b/gi)].map(m=>Number(m[1].replace(',','.')));
    if (pcands.length) pressureHpa = pcands[0];

    res.setHeader('Cache-Control','s-maxage=20, stale-while-revalidate=20');
    return res.status(200).json({
      ok:true,
      station:{
        id:'pg-lempes',
        sourceId:stationId,
        name:'Lempeș',
        lat:45.7148,
        lon:25.6527,
        elevationM:704
      },
      current:{time,windKmh,gustKmh,dir,tempC,pressureHpa},
      source:'Paragliding România / meteo.paragliding-romania.ro'
    });
  } catch(err) {
    return res.status(500).json({ok:false,error:String(err)});
  }
}
