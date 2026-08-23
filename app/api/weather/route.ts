import { getD1 } from "../../../db";
import { ensureRuntimeSchema } from "../../../db/runtime-schema";
import { getAppUser } from "../../server-auth";

type Hourly = { time: string[]; temperature_2m: number[]; apparent_temperature: number[]; relative_humidity_2m: number[]; precipitation_probability: number[]; precipitation: number[]; rain: number[]; weather_code: number[]; wind_speed_10m: number[]; wind_gusts_10m: number[] };

export async function GET(request: Request) {
  const user = await getAppUser(); if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureRuntimeSchema(); const params = new URL(request.url).searchParams; const circuitId = params.get("circuitId")?.trim() ?? "";
  const startDate = params.get("startDate") ?? ""; const endDate = params.get("endDate") ?? "";
  const circuit = await getD1().prepare("SELECT latitude,longitude FROM circuits WHERE id=?").bind(circuitId).first<{latitude:number|null;longitude:number|null}>();
  if (!circuit || circuit.latitude === null || circuit.longitude === null) return Response.json({ available: false, reason: "coordinates_missing" });
  const variables = "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m";
  const hourly = `${variables},precipitation_probability`;
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({ latitude:String(circuit.latitude),longitude:String(circuit.longitude),timezone:"auto",forecast_days:"16",current:variables,hourly }).toString();
  try {
    const response = await fetch(url, { headers: { accept: "application/json" } }); if (!response.ok) throw new Error("weather failed");
    const data = await response.json() as { current?:Record<string,number|string>; current_units?:Record<string,string>; hourly?:Hourly };
    const dates: Array<Record<string,number|string>> = [];
    const grouped = new Map<string, number[]>(); (data.hourly?.time ?? []).forEach((time,index) => { const date=time.slice(0,10); if (date >= startDate && date <= endDate) grouped.set(date,[...(grouped.get(date)??[]),index]); });
    for (const [date,indexes] of grouped) {
      const values=(key:keyof Hourly)=>indexes.map((index)=>Number(data.hourly?.[key]?.[index]??0));
      dates.push({ date,temperatureMin:Math.min(...values("temperature_2m")),temperatureMax:Math.max(...values("temperature_2m")),rainProbability:Math.max(...values("precipitation_probability")),rainTotal:values("rain").reduce((a,b)=>a+b,0),windMax:Math.max(...values("wind_speed_10m")),gustMax:Math.max(...values("wind_gusts_10m")),humidityMax:Math.max(...values("relative_humidity_2m")),weatherCode:Math.max(...values("weather_code")) });
    }
    return Response.json({ available:true,current:data.current??null,units:data.current_units??{},forecast:dates },{headers:{"cache-control":"private, max-age=600"}});
  } catch { return Response.json({ available:false,reason:"weather_unavailable" },{status:502}); }
}
