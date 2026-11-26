// Plantillas por tipo de evento. Todo se puede editar después dentro de cada evento.
// Posiciones del mapa en % (x, y): son aproximadas; los R4 pueden arrastrarlas.

const o = (id, es, en, x, y, team = "") => ({ id, es, en, x, y, team });

export const EVENT_TYPES = {
  svs: {
    icon: "⚔️",
    roles: true,
    teams: [],
    objectives: [
      o("castle", "Castillo", "Castle", 50, 50),
      o("can-n", "Cañón Norte", "North cannon", 50, 16),
      o("can-s", "Cañón Sur", "South cannon", 50, 84),
      o("can-e", "Cañón Este", "East cannon", 84, 50),
      o("can-w", "Cañón Oeste", "West cannon", 16, 50),
      o("rally", "Rallies / ataque", "Rallies / attack", 82, 14),
      o("mates", "Reforzar compañeros", "Reinforce teammates", 18, 86),
    ],
  },
  desert: {
    icon: "🏜️",
    roles: false,
    phases: true,
    map: { src: "img/map-desert.jpg", w: 1400, h: 989 },
    // 20 titulares + 10 suplentes por fuerza A/B. Editable.
    teams: [
      { id: "A", es: "Equipo A", en: "Task Force A", time: "", starters: 20, subs: 10 },
      { id: "B", es: "Equipo B", en: "Task Force B", time: "", starters: 20, subs: 10 },
    ],
    objectives: [
      o("silo", "Silo Nuclear", "Nuclear Silo", 51.4, 57),
      o("arsenal", "Arsenal", "Arsenal", 51.4, 32),
      o("merc", "Fábrica de Mercenarios", "Mercenary Factory", 51.4, 83),
      o("info", "Centro de Información", "Info Center", 35.4, 29),
      o("science", "Centro Científico", "Science Hub", 71, 85),
      o("hosp1", "Hospital de Campaña 1", "Field Hospital 1", 22, 69.6),
      o("hosp2", "Hospital de Campaña 2", "Field Hospital 2", 81.2, 41),
      o("hosp3", "Hospital de Campaña 3", "Field Hospital 3", 30.5, 84),
      o("hosp4", "Hospital de Campaña 4", "Field Hospital 4", 69, 29),
      o("oil1", "Refinería 1", "Oil Refinery 1", 22.4, 43),
      o("oil2", "Refinería 2", "Oil Refinery 2", 80.6, 69.6),
      o("base-us", "Nuestra base", "Our base", 9.5, 49),
      o("base-enemy", "Base rival", "Enemy base", 89.3, 48),
    ],
  },
  canyon: {
    icon: "🏞️",
    roles: false,
    phases: true,
    map: { src: "img/map-canyon.jpg", w: 864, h: 1055, labeled: true },
    // 1 vs 2 alianzas, hasta 20 jugadores + 10 suplentes por alianza. Cupos editables.
    teams: [
      { id: "A", es: "Equipo A", en: "Team A", time: "", starters: 20, subs: 10 },
      { id: "B", es: "Equipo B", en: "Team B", time: "", starters: 20, subs: 10 },
    ],
    // Edificios según el plano de planificación de la alianza (Team B, 19-nov-2026).
    objectives: [
      o("virus", "Laboratorio de Virus", "Virus Lab", 50, 66.8),
      o("tower", "Torre de Energía", "Power Tower", 59.6, 38.4),
      o("dc1", "Centro de Datos 1", "Data Center 1", 18.1, 24.8),
      o("dc2", "Centro de Datos 2", "Data Center 2", 81.6, 24.8),
      o("serum1", "Fábrica de Suero 1", "Serum Factory 1", 7.5, 42.2),
      o("serum2", "Fábrica de Suero 2", "Serum Factory 2", 89, 42.5),
      o("def1", "Sistema de Defensa 1", "Defense System 1", 27.8, 59.2),
      o("def2", "Sistema de Defensa 2", "Defense System 2", 80, 67.5),
      o("wh1", "Almacén de Muestras 1", "Sample Warehouse 1", 11, 70.6),
      o("wh3", "Almacén de Muestras 3", "Sample Warehouse 3", 36.5, 70.6),
      o("wh4", "Almacén de Muestras 4", "Sample Warehouse 4", 62, 70.6),
      o("wh2", "Almacén de Muestras 2", "Sample Warehouse 2", 88, 70.6),
      o("cleaner", "🧹 Limpiar bases", "🧹 Base cleaners", 50, 95),
    ],
  },
};

// Rol sugerido para SvS según poder (millones) y nivel.
export function suggestRole(m) {
  if (!m) return "flexible";
  if (m.power >= 250 && m.level >= 35) return "barro";
  if (m.power < 220 || m.level <= 33) return "guarnicion";
  return "flexible";
}
