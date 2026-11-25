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
    // 1 vs 2 alianzas, hasta 20 jugadores + 10 suplentes por alianza. Cupos editables.
    teams: [
      { id: "A", es: "Equipo A", en: "Team A", time: "", starters: 20, subs: 10 },
      { id: "B", es: "Equipo B", en: "Team B", time: "", starters: 20, subs: 10 },
    ],
    map: { src: "img/map-canyon.jpg", w: 1168, h: 900 },
    // Posiciones sobre el mapa de la temporada (captura del juego, nov-2026).
    // Solo el centro está identificado con seguridad; renombra el resto con el nombre del juego.
    objectives: [
      o("virus", "Laboratorio de Virus (centro)", "Virus Lab (center)", 50, 52),
      o("north", "Norte – grande (¿Torre de Energía?)", "North – big (Power Tower?)", 50, 32),
      o("nw-big", "Noroeste – grande", "Northwest – big", 20, 41),
      o("nw-tower", "Noroeste – torre", "Northwest – tower", 30, 19),
      o("w-small", "Oeste – pequeño", "West – small", 29, 49),
      o("sw-big", "Suroeste – grande", "Southwest – big", 18, 70),
      o("ne-big", "Noreste – grande", "Northeast – big", 81, 40),
      o("e-small", "Este – pequeño", "East – small", 70, 61),
      o("se-big", "Sureste – grande", "Southeast – big", 82, 71),
      o("s-small", "Sur – pequeño", "South – small", 55, 85),
      o("base-rule", "Base Gobernantes", "Rulebringers base", 50, 10),
      o("base-us", "Base nuestra (abajo izq.)", "Our base (bottom left)", 14, 94),
      o("base-ally", "Base aliada (abajo der.)", "Ally base (bottom right)", 86, 94),
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
