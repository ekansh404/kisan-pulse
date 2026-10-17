// Scheme eligibility from a curated rules file (data/schemes.json, from official sites).
// Status: 'eligible' | 'check' (need one more answer) | 'not_eligible'
import SCHEMES from '@/data/schemes.json';

export function checkSchemes(farmer = {}, lang = 'hi') {
  const hi = lang !== 'en';
  const acres = Number(farmer.land_acres || 0);
  return SCHEMES.map((s) => {
    const r = s.rules || {};
    let status = 'eligible';
    const why = [];
    if (r.min_land_acres && !(acres >= r.min_land_acres)) {
      status = 'check';
      why.push(hi ? 'ज़मीन की जानकारी चाहिए' : 'Land details needed');
    }
    if (r.max_land_acres && acres > r.max_land_acres) {
      status = 'not_eligible';
      why.push(hi ? 'सिर्फ़ 2 हेक्टेयर (≈5 एकड़) तक वाले किसान' : 'Only for farmers up to 2 hectares (~5 acres)');
    }
    if (r.needs_crop && !(farmer.crops || []).length) {
      status = status === 'not_eligible' ? status : 'check';
      why.push(hi ? 'कौन सी फसल है, बताइए' : 'Tell us your crop');
    }
    if (r.age_min && status === 'eligible') {
      status = 'check';
      why.push(hi ? `उम्र ${r.age_min}–${r.age_max} साल होनी चाहिए` : `Age must be ${r.age_min}–${r.age_max}`);
    }
    return {
      id: s.id,
      name: hi ? s.name_hi : s.name,
      benefit: hi ? s.benefit_hi : s.benefit,
      how: hi ? s.how_hi : s.how,
      exclusions: hi ? s.exclusions_hi : s.exclusions,
      documents: s.documents,
      source: s.source,
      status,
      why,
    };
  }).sort((a, b) => order(a.status) - order(b.status));
}

const order = (s) => ({ eligible: 0, check: 1, not_eligible: 2 }[s]);