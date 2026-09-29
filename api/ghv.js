export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const r = await fetch('https://brasovairport.ro/pasageri/', {
      headers: { 'User-Agent': 'ctr-brasov-aircraft/1.0', 'Accept': 'text/html' }
    });
    if (!r.ok) return res.status(502).json({ok:false,error:'GHV HTTP '+r.status});
    const html = await r.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi,' ')
      .replace(/<style[\s\S]*?<\/style>/gi,' ')
      .replace(/<[^>]+>/g,' ')
      .replace(/&nbsp;/gi,' ')
      .replace(/&amp;/gi,'&')
      .replace(/&#8211;|&ndash;/gi,'-')
      .replace(/\s+/g,' ')
      .trim();

    const dateMatch=text.match(/(LUNI|MAR[TȚ]I|MIERCURI|JOI|VINERI|S[ÂA]MB[ĂA]T[ĂA]|DUMINIC[ĂA])\s+\d{1,2}\s+[A-ZĂÂÎȘȚ]+\s+\d{4}/i);
    const dateLabel=dateMatch?dateMatch[0]:null;
    const re=/(WIZZ AIR|ANIMAWINGS|HISKY|TAILWIND)\s+([A-Z0-9]{2,3}\s*\d{3,4}[A-Z]?)\s+([^0-9]{3,90}?)\s+(\d{2}:\d{2})/gi;
    const all=[]; let m;
    while((m=re.exec(text))){
      const route=m[3].replace(/\s+/g,' ').trim();
      if(!/GHV\s+BRASOV/i.test(route)) continue;
      all.push({airline:m[1],flight:m[2].replace(/\s+/g,' ').trim(),route,time:m[4]});
      if(all.length>40) break;
    }
    const arrivals=all.filter(x=>/-\s*GHV\s+BRASOV/i.test(x.route));
    const departures=all.filter(x=>/GHV\s+BRASOV\s*-/i.test(x.route));
    res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=300');
    return res.status(200).json({ok:true,date:dateLabel,arrivals,departures,source:'brasovairport.ro'});
  } catch(err) {
    return res.status(500).json({ok:false,error:String(err)});
  }
}
