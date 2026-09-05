import cityData from '../data/cityProfiles.json';
import type { NeighbourhoodProfile } from '../simulation/types';
const city = cityData.cities.find(c => c.id === 'rotterdam')!;
export const PROFILES = (city.buurten as NeighbourhoodProfile[]).filter(p => p.population >= 250);
export const PROFILE_IDS = PROFILES.map(p => p.id);
export const POPULATION = PROFILES.reduce((n, p) => n + p.population, 0);
export const CITY_POPULATION = city.average.population;

