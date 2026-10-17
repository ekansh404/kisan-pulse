// STUB — Person 3 replaces this file (Open-Meteo forecast + farm alerts).
export async function getWeather() {
  return {
    stub: true, source: 'STUB',
    current: { temp: 30, humidity: 60, wind: 8, code: 2, text: 'हल्के बादल (stub)' },
    days: [0, 1, 2, 3].map((i) => ({ date: `day${i}`, max: 30, min: 19, rain_mm: i === 1 ? 22 : 0, rain_prob: 20, wind: 10, code: 2, text: 'stub' })),
    alerts: [{ level: 'red', type: 'rain', day: 1, title: 'कल भारी बारिश (stub)', advice: 'यह नकली डेटा है, Person 3 असली डेटा जोड़ेगा।' }],
  };
}
