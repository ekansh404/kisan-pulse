const WMO = {
  0: ['साफ़ आसमान', 'Clear sky'], 1: ['ज़्यादातर साफ़', 'Mostly clear'], 2: ['हल्के बादल', 'Partly cloudy'], 3: ['बादल', 'Cloudy'],
  45: ['कोहरा', 'Fog'], 48: ['घना कोहरा', 'Dense fog'],
  51: ['हल्की बूंदाबांदी', 'Light drizzle'], 53: ['बूंदाबांदी', 'Drizzle'], 55: ['तेज़ बूंदाबांदी', 'Heavy drizzle'],
  61: ['हल्की बारिश', 'Light rain'], 63: ['बारिश', 'Rain'], 65: ['भारी बारिश', 'Heavy rain'],
  71: ['हल्की बर्फ़', 'Light snow'], 73: ['बर्फ़', 'Snow'], 75: ['भारी बर्फ़', 'Heavy snow'],
  80: ['हल्की बौछार', 'Light showers'], 81: ['बौछार', 'Showers'], 82: ['तेज़ बौछार', 'Heavy showers'],
  95: ['आंधी-तूफ़ान', 'Thunderstorm'], 96: ['ओले के साथ तूफ़ान', 'Thunderstorm with hail'], 99: ['भारी ओले', 'Heavy hail'],
};
export const wmoText = (code, lang = 'hi') => (WMO[code] || ['मौसम', 'Weather'])[lang === 'en' ? 1 : 0];

export async function getWeather(lat, lon, lang = 'hi') {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max` +
    `&timezone=Asia%2FKolkata&forecast_days=7`;
  const res = await fetch(url, { next: { revalidate: 1800 } });
  if (!res.ok) throw new Error('weather ' + res.status);
  const d = await res.json();
  const days = d.daily.time.map((date, i) => ({
    date,
    max: Math.round(d.daily.temperature_2m_max[i]),
    min: Math.round(d.daily.temperature_2m_min[i]),
    rain_mm: Math.round((d.daily.precipitation_sum[i] || 0) * 10) / 10,
    rain_prob: d.daily.precipitation_probability_max?.[i] ?? null,
    wind: Math.round(d.daily.wind_speed_10m_max[i] || 0),
    code: d.daily.weather_code[i],
    text: wmoText(d.daily.weather_code[i], lang),
  }));
  return {
    source: 'Open-Meteo',
    current: {
      temp: Math.round(d.current.temperature_2m),
      humidity: d.current.relative_humidity_2m,
      wind: Math.round(d.current.wind_speed_10m),
      code: d.current.weather_code,
      text: wmoText(d.current.weather_code, lang),
    },
    days,
    alerts: farmAlerts(days, lang),
  };
}

// Simple, explainable rules -> farm advice. Looks at today + next 2 days.
export function farmAlerts(days, lang = 'hi') {
  const hi = lang !== 'en';
  const label = (i) => (hi ? ['आज', 'कल', 'परसों'][i] : ['Today', 'Tomorrow', 'Day after'][i]);
  const out = [];
  days.slice(0, 3).forEach((d, i) => {
    if (d.rain_mm >= 20 || [65, 82, 95, 96, 99].includes(d.code)) {
      out.push({ level: 'red', type: 'rain', day: i,
        title: hi ? `${label(i)} भारी बारिश (${d.rain_mm} mm)` : `${label(i)}: heavy rain (${d.rain_mm} mm)`,
        advice: hi ? 'छिड़काव और सिंचाई न करें। कटी फसल को ढक दें। खेत से पानी निकलने का रास्ता बनाएँ।' : 'Do not spray or irrigate. Cover harvested crop. Keep field drainage open.' });
    } else if (d.rain_mm >= 5 || (d.rain_prob ?? 0) >= 70) {
      out.push({ level: 'amber', type: 'rain', day: i,
        title: hi ? `${label(i)} बारिश की संभावना (${d.rain_prob ?? '-'}%)` : `${label(i)}: rain likely (${d.rain_prob ?? '-'}%)`,
        advice: hi ? 'दवाई का छिड़काव टालें, सिंचाई रोक सकते हैं।' : 'Postpone spraying; you can skip irrigation.' });
    }
    if ([96, 99].includes(d.code)) {
      out.push({ level: 'red', type: 'hail', day: i,
        title: hi ? `${label(i)} ओले गिरने का ख़तरा` : `${label(i)}: hail risk`,
        advice: hi ? 'नुकसान हो तो 72 घंटे के अंदर फसल बीमा (14447) पर सूचना दें।' : 'If crop is damaged, report to crop insurance (14447) within 72 hours.' });
    }
    if (d.max >= 40) {
      out.push({ level: 'red', type: 'heat', day: i,
        title: hi ? `${label(i)} लू / तेज़ गर्मी (${d.max}°C)` : `${label(i)}: heatwave (${d.max}°C)`,
        advice: hi ? 'सिंचाई सुबह या शाम करें। दोपहर में खेत में काम न करें, पानी पीते रहें।' : 'Irrigate in morning/evening. Avoid field work at noon, drink water.' });
    }
    if (d.min <= 4) {
      out.push({ level: 'red', type: 'frost', day: i,
        title: hi ? `${label(i)} पाला पड़ने का ख़तरा (${d.min}°C)` : `${label(i)}: frost risk (${d.min}°C)`,
        advice: hi ? 'शाम को हल्की सिंचाई करें, खेत के किनारे धुआँ करें।' : 'Light irrigation in the evening, smoke along field edges.' });
    }
    if (d.wind >= 40) {
      out.push({ level: 'amber', type: 'wind', day: i,
        title: hi ? `${label(i)} तेज़ हवा (${d.wind} km/h)` : `${label(i)}: strong wind (${d.wind} km/h)`,
        advice: hi ? 'छिड़काव न करें, ऊँची फसल को सहारा दें।' : 'Do not spray; support tall crops.' });
    }
  });
  return out;
}