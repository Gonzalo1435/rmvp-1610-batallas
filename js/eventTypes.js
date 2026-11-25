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
    // Fuente: guías de Last War (20 titulares + 10 suplentes por fuerza A/B). Editable.
    teams: [
      { id: "A", es: "Equipo A", en: "Task Force A", time: "", starters: 20, subs: 10 },
      { id: "B", es: "Equipo B", en: "Task Force B", time: "", starters: 20, subs: 10 },
    ],
    objectives: [
      o("silo", "Silo Nuclear", "Nuclear Silo", 50, 50),
      o("arsenal", "Arsenal", "Arsenal", 50, 32),
      o("merc", "Fábrica de Mercenarios", "Mercenary Factory", 50, 68),
      o("info", "Centro de Información", "Info Center", 22, 50),
      o("science", "Centro Científico", "Science Hub", 78, 50),
      o("hosp1", "Hospital de Campaña I", "Field Hospital I", 14, 18),
      o("hosp2", "Hospital de Campaña II", "Field Hospital II", 86, 18),
      o("hosp3", "Hospital de Campaña III", "Field Hospital III", 14, 82),
      o("hosp4", "Hospital de Campaña IV", "Field Hospital IV", 86, 82),
      o("oil1", "Refinería I", "Oil Refinery I", 36, 12),
      o("oil2", "Refinería II", "Oil Refinery II", 64, 88),
    ],
  },
  canyon: {
    icon: "🏞️",
    roles: false,
    // 1 vs 2 alianzas, hasta 20 jugadores por alianza por partida. Cupos editables.
    teams: [
      { id: "A", es: "Equipo A", en: "Team A", time: "", starters: 20, subs: 10 },
      { id: "B", es: "Equipo B", en: "Team B", time: "", starters: 20, subs: 10 },
    ],
    objectives: [
      o("virus", "Laboratorio de Virus", "Virus Lab", 50, 50),
      o("tower", "Torre de Energía", "Power Tower", 50, 26),
      o("dc1", "Centro de Datos I", "Data Center I", 20, 50),
      o("dc2", "Centro de Datos II", "Data Center II", 80, 50),
      o("wh1", "Almacén de Muestras I", "Sample Warehouse I", 14, 16),
      o("wh2", "Almacén de Muestras II", "Sample Warehouse II", 86, 16),
      o("wh3", "Almacén de Muestras III", "Sample Warehouse III", 14, 84),
      o("wh4", "Almacén de Muestras IV", "Sample Warehouse IV", 86, 84),
      o("defense", "Sistema de Defensa", "Defense System", 34, 74),
      o("serum", "Fábrica de Suero", "Serum Factory", 66, 74),
      o("power", "Central Eléctrica", "Power Station", 50, 86),
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
