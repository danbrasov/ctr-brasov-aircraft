const DIRECTIONS={N:0,NNE:22.5,NE:45,ENE:67.5,E:90,ESE:112.5,SE:135,SSE:157.5,S:180,SSV:202.5,SV:225,VSV:247.5,V:270,VNV:292.5,NV:315,NNV:337.5};

function mercatorToWgs84(x,y){
  const lon=Number(x)*180/20037508.34;
  const lat=(2*Math.atan(Math.exp(Number(y)/6378137))-Math.PI/2)*180/Math.PI;
  return [lat,lon];
}
function haversine(lat1,lon1,lat2,lon2){
  const r=x=>x*Math.PI/180,R=6371,dLat=r(lat2-lat1),dLon=r(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(r(lat1))*Math.cos(r(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
function num(x){
  if(x==null)return null;
  const n=Number(String(x).replace(',','.').match(/[-+]?\d+(?:[.,]\d+)?/)?.[0]?.replace(',','.'));
  return Number.isFinite(n)?n:null;
}
function parseWind(v){
  if(!v||String(v).trim().toLowerCase()==='indisponibil')return [null,null];
  const m=String(v).match(/([-+]?\d+(?:[.,]\d+)?)\s*m\/s.*?:\s*([A-Z]+)/i);
  if(!m)return [null,null];
  const ms=Number(m[1].replace(',','.')),dir=DIRECTIONS[m[2].toUpperCase()];
  return [Number.isFinite(ms)?ms:null,Number.isFinite(dir)?dir:null];
}
function slug(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  if(req.method==='OPTIONS')return res.status(204).end();

  const C={lat:45.6579,lon:25.6012},radiusKm=75;
  try{
    const r=await fetch('https://www.meteoromania.ro/wp-json/meteoapi/v2/starea-vremii',{
      headers:{'Accept':'application/json','User-Agent':'ctr-brasov-aircraft/1.0'}
    });
    if(!r.ok)return res.status(502).json({ok:false,error:'ANM HTTP '+r.status});
    const d=await r.json(),stations=[];
    for(const f of (d.features||[])){
      const p=f.properties||{},g=f.geometry||{},co=g.coordinates||[],name=String(p.nume||'').trim();
      if(!name||co.length<2)continue;
      const [lat,lon]=mercatorToWgs84(co[0],co[1]);
      const distanceKm=haversine(C.lat,C.lon,lat,lon);
      if(distanceKm>radiusKm)continue;
      const [ms,dir]=parseWind(p.vant);
      if(ms==null||dir==null)continue;
      const tempC=num(p.tempe),pressureHpa=num(p.presiunetext);
      stations.push({
        id:'anm-'+slug(name),name,lat,lon,
        distanceKm:Math.round(distanceKm*10)/10,
        windKmh:Math.round(ms*3.6*10)/10,
        dir,tempC,pressureHpa,
        observedAt:d.date||null,
        source:'ANM Romania'
      });
    }
    stations.sort((a,b)=>a.distanceKm-b.distanceKm);

    // Known station elevations from published station metadata.
    for(const s of stations){
      const n=String(s.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
      if(n==='VARFUL OMU') s.elevationM=2504;
    }

    // ANM public feed does not expose station elevation. Enrich nearby stations
    // with terrain elevation from Open-Meteo / Copernicus DEM GLO-90.
    if(stations.length){
      try{
        const lats=stations.map(s=>s.lat).join(',');
        const lons=stations.map(s=>s.lon).join(',');
        const er=await fetch('https://api.open-meteo.com/v1/elevation?latitude='+encodeURIComponent(lats)+'&longitude='+encodeURIComponent(lons),{
          headers:{'Accept':'application/json','User-Agent':'ctr-brasov-aircraft/1.0'}
        });
        if(er.ok){
          const ed=await er.json(),elev=Array.isArray(ed.elevation)?ed.elevation:[];
          stations.forEach((s,i)=>{
            const v=Number(elev[i]);
            if(Number.isFinite(v))s.elevationM=Math.round(v);
          });
        }
      }catch(e){
        // Elevation is optional; weather data remains usable without it.
      }
    }

    res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=300');
    return res.status(200).json({ok:true,checkedAt:d.date||new Date().toISOString(),radiusKm,stations,source:'ANM Romania'});
  }catch(err){
    return res.status(500).json({ok:false,error:String(err)});
  }
}
