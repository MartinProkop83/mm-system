"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CountrySelect } from "./country-select";
import { countryFlag, localizedCountries } from "./countries";
import { NativeImage } from "./native-image";

type Locale = "cs" | "en";
type Role = "superadmin" | "boss" | "mechanic";
export type CircuitRecord = {
  id: string; name: string; countryCode: string; address: string; websiteUrl: string; mapsUrl: string;
  latitude: number | null; longitude: number | null; distanceKm: number | null; driveMinutes: number | null; imageUrl: string;
};

export function CircuitsPage({ locale, role }: { locale: Locale; role: Role }) {
  const [circuits,setCircuits]=useState<CircuitRecord[]>([]); const [loading,setLoading]=useState(true); const [form,setForm]=useState<CircuitRecord|null|undefined>(undefined); const [country,setCountry]=useState("");
  const canManage=role!=="mechanic";
  const load=useCallback(async()=>{setLoading(true);try{const response=await fetch("/api/circuits",{cache:"no-store"});if(!response.ok)throw new Error();setCircuits(((await response.json()) as {circuits:CircuitRecord[]}).circuits);}finally{setLoading(false);}},[]);
  useEffect(()=>{void Promise.resolve().then(load);},[load]);
  const shown=country?circuits.filter((item)=>item.countryCode===country):circuits;
  const groups=useMemo(()=>Array.from(new Set(shown.map((item)=>item.countryCode))).map((code)=>({code,items:shown.filter((item)=>item.countryCode===code)})),[shown]);
  async function archive(item:CircuitRecord){if(role!=="superadmin"||!window.confirm(locale==="cs"?`Opravdu odstranit trať ${item.name}?`:`Delete ${item.name}?`))return;const response=await fetch("/api/circuits",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id:item.id})});if(!response.ok)return alert(await errorText(response));await load();}
  const countries=localizedCountries(locale);
  return <div className="circuits-page"><section className="panel circuit-directory-header"><div><span className="eyebrow">MM CIRCUIT DIRECTORY</span><h2>{locale==="cs"?"Tratě":"Circuits"}</h2><p>{locale==="cs"?"Adresář tratí, doprava a závodní počasí":"Circuit directory, travel and racing weather"}</p></div><div className="circuit-header-actions"><strong>{circuits.length}</strong>{canManage&&<button className="primary-button" type="button" onClick={()=>setForm(null)}>＋ {locale==="cs"?"Nová trať":"New circuit"}</button>}</div></section>
  <section className="panel circuit-filter"><label><span>{locale==="cs"?"Filtrovat podle země":"Filter by country"}</span><select value={country} onChange={(event)=>setCountry(event.target.value)}><option value="">{locale==="cs"?"Všechny země":"All countries"}</option>{countries.filter((item)=>circuits.some((circuit)=>circuit.countryCode===item.code)).map((item)=><option key={item.code} value={item.code}>{item.flag} {item.name}</option>)}</select></label></section>
  {loading?<section className="panel empty-state"><span className="spinner"/></section>:groups.length===0?<section className="panel empty-state"><h2>{locale==="cs"?"Zatím žádné tratě":"No circuits yet"}</h2></section>:groups.map((group)=><section className="circuit-country-group" key={group.code}><header><h2>{countryFlag(group.code)} {countries.find((item)=>item.code===group.code)?.name??group.code}</h2><span>{group.items.length}</span></header><div className="circuit-card-grid">{group.items.map((item)=><article className="panel circuit-card" key={item.id}><div className="circuit-card-image">{item.imageUrl?<NativeImage src={item.imageUrl} alt={item.name}/>:<span>⌁</span>}</div><div className="circuit-card-body"><span className="eyebrow">{countryFlag(item.countryCode)} {item.countryCode}</span><h3>{item.name}</h3><p>{item.address||"—"}</p><div className={item.latitude!==null&&item.longitude!==null?"circuit-location-state ready":"circuit-location-state missing"}>{item.latitude!==null&&item.longitude!==null?(locale==="cs"?"✓ Poloha a počasí připravené":"✓ Location and weather ready"):(locale==="cs"?"! Doplň polohu pro počasí":"! Add location for weather")}</div><div className="circuit-trip">{item.distanceKm!==null&&<strong>{formatNumber(item.distanceKm)} km</strong>}{item.driveMinutes!==null&&<span>≈ {formatMinutes(item.driveMinutes,locale)}</span>}</div><div className="circuit-links">{item.mapsUrl&&<a href={item.mapsUrl} target="_blank" rel="noreferrer">⌖ Google Maps</a>}{item.websiteUrl&&<a href={item.websiteUrl} target="_blank" rel="noreferrer">↗ Web</a>}</div></div>{canManage&&<footer><button className="secondary-compact" type="button" onClick={()=>setForm(item)}>{locale==="cs"?"Upravit":"Edit"}</button>{role==="superadmin"&&<button className="danger-compact" type="button" onClick={()=>void archive(item)}>{locale==="cs"?"Smazat":"Delete"}</button>}</footer>}</article>)}</div></section>)}
  {form!==undefined&&<CircuitForm locale={locale} circuit={form} onClose={()=>setForm(undefined)} onSaved={async()=>{setForm(undefined);await load();}}/>}</div>;
}

function CircuitForm({locale,circuit,onClose,onSaved}:{locale:Locale;circuit:CircuitRecord|null;onClose:()=>void;onSaved:()=>void}){
  const [saving,setSaving]=useState(false);
  const [locating,setLocating]=useState(false);
  const [error,setError]=useState("");
  const [preview,setPreview]=useState(circuit?.imageUrl??"");
  const [name,setName]=useState(circuit?.name??"");
  const [countryCode,setCountryCode]=useState(circuit?.countryCode??"");
  const [address,setAddress]=useState(circuit?.address??"");
  const [mapsUrl,setMapsUrl]=useState(circuit?.mapsUrl??"");
  const [latitude,setLatitude]=useState<number|null>(circuit?.latitude??null);
  const [longitude,setLongitude]=useState<number|null>(circuit?.longitude??null);
  const [distanceKm,setDistanceKm]=useState<number|null>(circuit?.distanceKm??null);
  const [driveMinutes,setDriveMinutes]=useState<number|null>(circuit?.driveMinutes??null);
  const [locationState,setLocationState]=useState<"idle"|"ready"|"missing">(circuit?.latitude!==null&&circuit?.longitude!==null?"ready":"idle");

  function invalidateAutoLocation(){
    setLatitude(null);
    setLongitude(null);
    setDistanceKm(null);
    setDriveMinutes(null);
    setLocationState("idle");
  }

  async function locate(quiet=false){
    if(!name&&!address&&!mapsUrl)return null;
    setLocating(true);if(!quiet)setError("");
    try{
      const response=await fetch("/api/circuit-location",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,countryCode,address,mapsUrl,latitude,longitude})});
      const result=await response.json() as {location?:{latitude:number;longitude:number;source:string};travel?:{distanceKm:number;driveMinutes:number}|null;error?:string};
      if(!response.ok||!result.location)throw new Error(result.error||"Location failed");
      setLatitude(result.location.latitude);setLongitude(result.location.longitude);if(result.travel){setDistanceKm(result.travel.distanceKm);setDriveMinutes(result.travel.driveMinutes);}setLocationState("ready");return {...result.location,...(result.travel??{})};
    }catch{
      setLocationState("missing");
      if(!quiet)setError(locale==="cs"?"Polohu se nepodařilo určit. Vlož přesný odkaz Google Maps, nebo souřadnice doplň ručně.":"Location could not be determined. Paste a precise Google Maps link or enter coordinates manually.");
      return null;
    }finally{setLocating(false);}
  }

  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setSaving(true);setError("");
    const form=new FormData(event.currentTarget);const image=form.get("image");const payload=Object.fromEntries(form.entries());delete payload.image;
    try{
      const found=latitude!==null&&longitude!==null?{latitude,longitude}:await locate(true);
      const response=await fetch("/api/circuits",{method:circuit?"PUT":"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...payload,name,countryCode,address,mapsUrl,latitude:found?.latitude??"",longitude:found?.longitude??"",distanceKm:found&&"distanceKm" in found?found.distanceKm:distanceKm??"",driveMinutes:found&&"driveMinutes" in found?found.driveMinutes:driveMinutes??"",id:circuit?.id})});
      const result=await response.json() as {id?:string;error?:string};if(!response.ok||!result.id)throw new Error(result.error||"Save failed");
      if(image instanceof File&&image.size){const upload=new FormData();upload.set("circuitId",result.id);upload.set("image",image);const uploadResponse=await fetch("/api/circuit-image",{method:"POST",body:upload});if(!uploadResponse.ok)throw new Error(await errorText(uploadResponse));}
      onSaved();
    }catch(saveError){setError(saveError instanceof Error?saveError.message:"Save failed");setSaving(false);}
  }

  return <div className="modal-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)onClose();}}><section className="modal circuit-modal" role="dialog" aria-modal="true"><div className="modal-header"><div><span className="eyebrow">MM CIRCUIT DIRECTORY</span><h2>{circuit?(locale==="cs"?"Upravit trať":"Edit circuit"):(locale==="cs"?"Nová trať":"New circuit")}</h2></div><button className="close-button" type="button" onClick={onClose}>×</button></div><form onSubmit={submit}><div className="form-grid">
    <label><span>{locale==="cs"?"Název":"Name"} *</span><input name="name" required autoFocus value={name} onChange={(event)=>{setName(event.target.value);invalidateAutoLocation();}}/></label>
    <label><span>{locale==="cs"?"Země":"Country"} *</span><CountrySelect name="countryCode" locale={locale} required value={countryCode} onChange={(event)=>{setCountryCode(event.target.value);invalidateAutoLocation();}}/></label>
    <label className="full-field"><span>{locale==="cs"?"Adresa":"Address"}</span><input name="address" value={address} onChange={(event)=>{setAddress(event.target.value);invalidateAutoLocation();}}/></label>
    <label><span>Web</span><input name="websiteUrl" type="url" placeholder="https://…" defaultValue={circuit?.websiteUrl??""}/></label>
    <label><span>Google Maps</span><input name="mapsUrl" type="url" placeholder={locale==="cs"?"Vlož odkaz sdílený z Google Maps":"Paste a Google Maps share link"} value={mapsUrl} onChange={(event)=>{setMapsUrl(event.target.value);invalidateAutoLocation();}} onBlur={()=>{if(mapsUrl.trim())void locate(true);}}/></label>
    <div className={`circuit-location-check ${locationState}`}><div><strong>{locationState==="ready"?(locale==="cs"?"✓ Poloha pro počasí nalezena":"✓ Weather location found"):locationState==="missing"?(locale==="cs"?"! Polohu se nepodařilo určit":"! Location not found"):(locale==="cs"?"Poloha pro počasí":"Weather location")}</strong><small>{locationState==="ready"?`${latitude?.toFixed(5)}, ${longitude?.toFixed(5)}`:(locale==="cs"?"Načte se z Google Maps nebo adresy":"Loaded from Google Maps or the address")}</small></div><button className="secondary-compact" type="button" disabled={locating} onClick={()=>void locate()}>{locating?(locale==="cs"?"Hledám…":"Finding…"):(locale==="cs"?"Načíst polohu":"Find location")}</button></div>
    <label><span>{locale==="cs"?"Orientační vzdálenost z dílny (km)":"Estimated distance from workshop (km)"}</span><input name="distanceKm" type="number" min="0" step="0.1" value={distanceKm??""} onChange={(event)=>setDistanceKm(event.target.value===""?null:Number(event.target.value))}/><small>{locale==="cs"?"Automatický orientační výpočet podle silniční trasy.":"Automatic estimate from the driving route."}</small></label>
    <label><span>{locale==="cs"?"Orientační doba jízdy (minuty)":"Estimated drive time (minutes)"}</span><input name="driveMinutes" type="number" min="0" step="1" value={driveMinutes??""} onChange={(event)=>setDriveMinutes(event.target.value===""?null:Number(event.target.value))}/><small>{locale==="cs"?"Bez aktuálních kolon a dopravní situace.":"Without live traffic conditions."}</small></label>
    <details className="full-field circuit-coordinate-details"><summary>{locale==="cs"?"Ruční upřesnění souřadnic":"Enter coordinates manually"}</summary><div><label><span>Latitude</span><input name="latitude" type="number" min="-90" max="90" step="any" value={latitude??""} onChange={(event)=>{setLatitude(event.target.value===""?null:Number(event.target.value));setLocationState("idle");}}/></label><label><span>Longitude</span><input name="longitude" type="number" min="-180" max="180" step="any" value={longitude??""} onChange={(event)=>{setLongitude(event.target.value===""?null:Number(event.target.value));setLocationState("idle");}}/></label></div></details>
    <label className="full-field circuit-image-field"><span>{locale==="cs"?"Obrázek / mapa tratě":"Circuit image / map"}</span><input name="image" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event)=>{const file=event.target.files?.[0];if(file)setPreview(URL.createObjectURL(file));}}/>{preview&&<NativeImage src={preview} alt="Preview"/>}<small>{locale==="cs"?"PNG, JPG nebo WebP; libovolný poměr stran, maximálně 10 MB.":"PNG, JPG or WebP; any aspect ratio, max 10 MB."}</small></label>
  </div>{error&&<p className="form-error">{error}</p>}<div className="modal-actions"><span className="modal-actions-spacer"/><button className="secondary-compact" type="button" onClick={onClose}>{locale==="cs"?"Zrušit":"Cancel"}</button><button className="primary-button" type="submit" disabled={saving||locating}>{saving?(locale==="cs"?"Ukládám…":"Saving…"):(locale==="cs"?"Uložit trať":"Save circuit")}</button></div></form></section></div>;
}

async function errorText(response:Response){const result=await response.json().catch(()=>({})) as {error?:string};return result.error||"Operation failed";}
function formatNumber(value:number){return new Intl.NumberFormat("cs-CZ",{maximumFractionDigits:1}).format(value);}
function formatMinutes(value:number,locale:Locale){const hours=Math.floor(value/60);const minutes=value%60;if(!hours)return `${minutes} min`;return locale==="cs"?`${hours} h ${minutes} min`:`${hours} h ${minutes} min`;}
