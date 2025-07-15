// /src/app/core/data/navigation.data.ts

// --- EXPORTIERTE INTERFACES ---
export interface NavSubItem {
  label: string;
  i18nId: string; // Key für Transloco
  link: string;
  iconFilename?: string; // Optionaler Dateiname des Icons
  descriptionI18nId?: string; // NEU: SEO-Beschreibung für Produktlisten (Unterkategorien)
}

export interface NavItem {
  label: string; // Fallback oder interner Bezeichner
  i18nId: string; // Key für Transloco
  link: string;
  descriptionI18nId?: string; // NEU: SEO-Beschreibung für Hauptkategorien
  subItems?: NavSubItem[];
  isExpanded?: boolean; // Für mobiles Menü
}

// --- EXPORTIERTE NAVIGATIONSDATEN ---
export const navItems: NavItem[] = [
  { label: 'Home', i18nId: 'header.nav.home', link: '/' },
  {
    label: 'Gartenmöbel',
    i18nId: 'header.nav.furniture',
    link: '/category/gartenmoebel',
    descriptionI18nId: 'categoryDescriptions.furniture',
    subItems: [
      { label: 'Sofas', i18nId: 'header.nav.furniture.sofas', link: '/product-list/gartenmoebel-sofas', iconFilename: 'Gatensofas.png', descriptionI18nId: 'categoryDescriptions.furniture_sofas' },
      { label: 'Stühle', i18nId: 'header.nav.furniture.chairs', link: '/product-list/gartenmoebel-stuehle', iconFilename: 'GartenSessel.png', descriptionI18nId: 'categoryDescriptions.furniture_chairs' },
      { label: 'Hocker', i18nId: 'header.nav.furniture.stools', link: '/product-list/gartenmoebel-hocker', iconFilename: 'hocker.png', descriptionI18nId: 'categoryDescriptions.furniture_stools' },
      { label: 'Sitzpolster', i18nId: 'header.nav.furniture.seatingGroups', link: '/product-list/gartenmoebel-sitzpolster', iconFilename: 'polster.png', descriptionI18nId: 'categoryDescriptions.furniture_seatingGroups' },
      { label: 'Gartentische', i18nId: 'header.nav.furniture.tables', link: '/product-list/gartenmoebel-tische', iconFilename: 'Tsch.png', descriptionI18nId: 'categoryDescriptions.furniture_tables' },
      { label: 'Bänke', i18nId: 'header.nav.furniture.benches', link: '/product-list/gartenmoebel-baenke', iconFilename: 'Bank.png', descriptionI18nId: 'categoryDescriptions.furniture_benches' },
      { label: 'Liegen', i18nId: 'header.nav.furniture.sunloungers', link: '/product-list/gartenmoebel-liegen', iconFilename: 'Sonnenliege.png', descriptionI18nId: 'categoryDescriptions.furniture_sunloungers' },
      { label: 'Betten', i18nId: 'header.nav.furniture.beds', link: '/product-list/gartenmoebel-betten', iconFilename: 'Bett.png', descriptionI18nId: 'categoryDescriptions.furniture_beds' },
      { label: 'Hängematten', i18nId: 'header.nav.furniture.hammocks', link: '/product-list/gartenmoebel-haengematten', iconFilename: 'haengmatte.png', descriptionI18nId: 'categoryDescriptions.furniture_hammocks' },
      { label: 'Schaukeln', i18nId: 'header.nav.furniture.swings', link: '/product-list/gartenmoebel-schaukeln', iconFilename: 'Hollywood.png', descriptionI18nId: 'categoryDescriptions.furniture_swings' },
      { label: 'Schutzhüllen', i18nId: 'header.nav.furniture.covers', link: '/product-list/gartenmoebel-schutzhuellen', iconFilename: 'Schutzhuelle.png', descriptionI18nId: 'categoryDescriptions.furniture_covers' },
      { label: 'Boxen', i18nId: 'header.nav.furniture.box', link: '/product-list/gartenmoebel-boxen', iconFilename: 'gartenbox.png', descriptionI18nId: 'categoryDescriptions.furniture_box' }
    ]
  },
  {
    label: 'Sonnenschutz',
    i18nId: 'header.nav.sunprotection',
    link: '/category/sonnenschutz',
    descriptionI18nId: 'categoryDescriptions.sunprotection',
    subItems: [
      { label: 'Markisen', i18nId: 'header.nav.sunprotection.awnings', link: '/product-list/sonnenschutz-markisen', iconFilename: 'Markise.png', descriptionI18nId: 'categoryDescriptions.sunprotection_awnings' },
      { label: 'Sonnenschirme', i18nId: 'header.nav.sunprotection.umbrellas', link: '/product-list/sonnenschutz-sonnenschirme', iconFilename: 'Sonnenschirm.png', descriptionI18nId: 'categoryDescriptions.sunprotection_umbrellas' },
      { label: 'Zubehör', i18nId: 'header.nav.sunprotection.accessories', link: '/product-list/sonnenschutz-zubehoer', iconFilename: 'schrimzubehoer.png', descriptionI18nId: 'categoryDescriptions.sunprotection_accessories' }
    ]
  },
  {
    label: 'Wasser im Garten',
    i18nId: 'header.nav.water',
    link: '/category/wasser-im-garten',
    descriptionI18nId: 'categoryDescriptions.water',
    subItems: [
      { label: 'Pools', i18nId: 'header.nav.water.pools', link: '/product-list/wasser-im-garten-pools', iconFilename: 'Pool.png', descriptionI18nId: 'categoryDescriptions.water_pools' },
      { label: 'Teichzubehör', i18nId: 'header.nav.water.pondAccessories', link: '/product-list/wasser-im-garten-teichzubehoer', iconFilename: 'teichzubehoer.png', descriptionI18nId: 'categoryDescriptions.water_pondAccessories' },
      { label: 'Poolzubehör', i18nId: 'header.nav.water.poolAccessories', link: '/product-list/wasser-im-garten-poolzubehoer', iconFilename: 'pollzubehoer.png', descriptionI18nId: 'categoryDescriptions.water_poolAccessories' }
    ]
  },
  {
    label: 'Heizen & Feuer',
    i18nId: 'header.nav.heating',
    link: '/category/heizen-feuer',
    descriptionI18nId: 'categoryDescriptions.heating',
    subItems: [
      { label: 'Kamine', i18nId: 'header.nav.heating.fireplaces', link: '/product-list/heizen-feuer-kamine', iconFilename: 'Feuer.png', descriptionI18nId: 'categoryDescriptions.heating_fireplaces' },
      { label: 'Feuerholzaufbewahrung', i18nId: 'header.nav.heating.firewoodstorage', link: '/product-list/heizen-feuer-feuerholzaufbewahrung', iconFilename: 'Holz.png', descriptionI18nId: 'categoryDescriptions.heating_firewoodstorage' },
      { label: 'Zubehör', i18nId: 'header.nav.heating.heaters', link: '/product-list/heizen-feuer-zubehoer', iconFilename: 'holzzubehoer.png', descriptionI18nId: 'categoryDescriptions.heating_heaters' }
    ]
  },
  {
    label: 'Gartenhelfer & Aufbewahrung',
    i18nId: 'header.nav.gardenhelpers',
    link: '/category/gartenhelfer-aufbewahrung',
    descriptionI18nId: 'categoryDescriptions.gardenhelpers',
    subItems: [
      { label: 'Gartengeräte', i18nId: 'header.nav.gardenhelpers.tools', link: '/product-list/gartenhelfer-aufbewahrung-gartengeraete', iconFilename: 'Maeher.png', descriptionI18nId: 'categoryDescriptions.gardenhelpers_tools' },
      { label: 'Gartenschuppen', i18nId: 'header.nav.gardenhelpers.sheds', link: '/product-list/gartenhelfer-aufbewahrung-gartenschuppen', iconFilename: 'schuppen.png', descriptionI18nId: 'categoryDescriptions.gardenhelpers_sheds' },
      { label: 'Komposter', i18nId: 'header.nav.gardenhelpers.composters', link: '/product-list/gartenhelfer-aufbewahrung-komposter', iconFilename: 'BIO.png', descriptionI18nId: 'categoryDescriptions.gardenhelpers_composters' },
      { label: 'Regentonnen', i18nId: 'header.nav.gardenhelpers.waterbutts', link: '/product-list/gartenhelfer-aufbewahrung-regentonnen', iconFilename: 'regentonne.png', descriptionI18nId: 'categoryDescriptions.gardenhelpers_waterbutts' },
      { label: 'Gartenwerkzeug', i18nId: 'header.nav.gardenhelpers.toolstorage', link: '/product-list/gartenhelfer-aufbewahrung-werkzeug', iconFilename: 'werkzeug.png', descriptionI18nId: 'categoryDescriptions.gardenhelpers_toolstorage' }
    ]
  },
  {
    label: 'Dekoration & Licht',
    i18nId: 'header.nav.deco',
    link: '/category/deko-licht',
    descriptionI18nId: 'categoryDescriptions.deco',
    subItems: [
      { label: 'Gartenbeleuchtung', i18nId: 'header.nav.deco.lighting', link: '/product-list/deko-licht-gartenbeleuchtung', iconFilename: 'Lampe.png', descriptionI18nId: 'categoryDescriptions.deco_lighting' },
      { label: 'Gartenlautsprecher' , i18nId: 'header.nav.deco.audio', link: '/product-list/deko-licht-audio', iconFilename: 'audio.png', descriptionI18nId: 'categoryDescriptions.deco_audio' },
      { label: 'Gartendeko', i18nId: 'header.nav.deco.decoration', link: '/product-list/deko-licht-gartendeko', iconFilename: 'Deko.png', descriptionI18nId: 'categoryDescriptions.deco_decoration' },
      { label: 'Gartenteppiche', i18nId: 'header.nav.deco.rugs', link: '/product-list/deko-licht-gartenteppiche', iconFilename: 'Teppich.png', descriptionI18nId: 'categoryDescriptions.deco_rugs' },
      { label: 'Weihnachtsdeko', i18nId: 'header.nav.deco.christmas', link: '/product-list/deko-licht-weihnachtsdeko', iconFilename: 'weihnacht.png', descriptionI18nId: 'categoryDescriptions.deco_christmas' }
    ]
  },
  {
    label: 'Pflanzen & Anzucht',
    i18nId: 'header.nav.plants',
    link: '/category/pflanzen-anzucht',
    descriptionI18nId: 'categoryDescriptions.plants',
    subItems: [
      { label: 'Gewächshäuser', i18nId: 'header.nav.plants.greenhouses', link: '/product-list/pflanzen-anzucht-gewaechshaeuser', iconFilename: 'Gewaechs.png', descriptionI18nId: 'categoryDescriptions.plants_greenhouses' },
      { label: 'Hochbeete', i18nId: 'header.nav.plants.raisedbeds', link: '/product-list/pflanzen-anzucht-hochbeet', iconFilename: 'gatenbox.png', descriptionI18nId: 'categoryDescriptions.plants_raisedbeds' },
      { label: 'Tische', i18nId: 'header.nav.plants.tables', link: '/product-list/pflanzen-anzucht-tische', iconFilename: 'planztisch.png', descriptionI18nId: 'categoryDescriptions.plants_tables' },
      { label: 'Ständer', i18nId: 'header.nav.plants.stands', link: '/product-list/pflanzen-anzucht-staender', iconFilename: 'staender.png', descriptionI18nId: 'categoryDescriptions.plants_stands' },
      { label: 'Kunstpflanzen', i18nId: 'header.nav.plants.artificial', link: '/product-list/pflanzen-anzucht-kunstpflanzen', iconFilename: 'kunst.png', descriptionI18nId: 'categoryDescriptions.plants_artificial' },
      { label: 'Pflanzenschutz', i18nId: 'header.nav.plants.protection', link: '/product-list/pflanzen-anzucht-pflanzenschutz', iconFilename: 'Schutz.png', descriptionI18nId: 'categoryDescriptions.plants_protection' },
      { label: 'Pflanzgefäße', i18nId: 'header.nav.plants.planters', link: '/product-list/pflanzen-anzucht-pflanzgefaesse', iconFilename: 'Topf.png', descriptionI18nId: 'categoryDescriptions.plants_planters' },
      { label: 'Rankhilfen', i18nId: 'header.nav.plants.trellises', link: '/product-list/pflanzen-anzucht-rankhilfen', iconFilename: 'ranken.png', descriptionI18nId: 'categoryDescriptions.plants_trellises' },
      { label: 'Bewässerung', i18nId: 'header.nav.plants.irrigation', link: '/product-list/pflanzen-anzucht-bewaesserung', iconFilename: 'bewaesserung.png', descriptionI18nId: 'categoryDescriptions.plants_irrigation' },
    ]
  },
  {
    label: 'Spiel & Spaß',
    i18nId: 'header.nav.playfun',
    link: '/category/fuer-die-ganze-grossen',
    descriptionI18nId: 'categoryDescriptions.playfun',
    subItems: [
      { label: 'Sandkästen', i18nId: 'header.nav.playfun.sandpits', link: '/product-list/fuer-die-ganze-grossen-sandkasten', iconFilename: 'sandkasten.png', descriptionI18nId: 'categoryDescriptions.playfun_sandpits' },
      { label: 'Spielburgen', i18nId: 'header.nav.playfun.playcastles', link: '/product-list/fuer-die-ganze-grossen-spielburgen', iconFilename: 'spielburgen.png', descriptionI18nId: 'categoryDescriptions.playfun_playcastles' },
      { label: 'Schaukeln', i18nId: 'header.nav.playfun.swings', link: '/product-list/fuer-die-ganze-grossen-schaukeln', iconFilename: 'schukel.png', descriptionI18nId: 'categoryDescriptions.playfun_swings' },
      { label: 'Trampoline', i18nId: 'header.nav.playfun.trampolines', link: '/product-list/fuer-die-ganze-grossen-trampoline', iconFilename: 'trampo.png', descriptionI18nId: 'categoryDescriptions.playfun_trampolines' },
      { label: 'Zubehör', i18nId: 'header.nav.playfun.accessories', link: '/product-list/fuer-die-ganze-grossen-zubehoer', iconFilename: 'trampozubehoer.png', descriptionI18nId: 'categoryDescriptions.playfun_accessories' }
    ]
  }
];