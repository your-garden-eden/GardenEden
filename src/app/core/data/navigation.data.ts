// /src/app/core/data/navigation.data.ts

// --- EXPORTIERTE INTERFACES ---
export interface NavSubItem {
  label: string;
  i18nId: string; // Key für Transloco
  link: string;
  iconFilename?: string; // Optionaler Dateiname des Icons
}

export interface NavItem {
  label: string; // Fallback oder interner Bezeichner
  i18nId: string; // Key für Transloco
  link: string;
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
    subItems: [
      { label: 'Sofas', i18nId: 'header.nav.furniture.sofas', link: '/product-list/gartenmoebel-sofas', iconFilename: 'Gatensofas.png' }, // :)
      { label: 'Stühle', i18nId: 'header.nav.furniture.chairs', link: '/product-list/gartenmoebel-stuehle', iconFilename: 'GartenSessel.png' }, // :) 
      { label: 'Hocker', i18nId: 'header.nav.furniture.stools', link: '/product-list/gartenmoebel-hocker', iconFilename: 'hocker.png' }, // :)
      { label: 'Sitzpolster', i18nId: 'header.nav.furniture.seatingGroups', link: '/product-list/gartenmoebel-sitzpolster', iconFilename: 'polster.png' }, // :)
      { label: 'Gartentische', i18nId: 'header.nav.furniture.tables', link: '/product-list/gartenmoebel-tische', iconFilename: 'Tsch.png' }, // :)
      { label: 'Bänke', i18nId: 'header.nav.furniture.benches', link: '/product-list/gartenmoebel-baenke', iconFilename: 'Bank.png' }, // :)
      { label: 'Liegen', i18nId: 'header.nav.furniture.sunloungers', link: '/product-list/gartenmoebel-liegen', iconFilename: 'Sonnenliege.png' }, // :)
      { label: 'Betten', i18nId: 'header.nav.furniture.beds', link: '/product-list/gartenmoebel-betten', iconFilename: 'Bett.png' }, // Ggf. anderes Icon
      { label: 'Hängematten', i18nId: 'header.nav.furniture.hammocks', link: '/product-list/gartenmoebel-haengematten', iconFilename: 'haengmatte.png' }, // :)
      { label: 'Schaukeln', i18nId: 'header.nav.furniture.swings', link: '/product-list/gartenmoebel-schaukeln', iconFilename: 'Hollywood.png' }, // :)
      { label: 'Schutzhüllen', i18nId: 'header.nav.furniture.covers', link: '/product-list/gartenmoebel-schutzhuellen', iconFilename: 'Schutzhuelle.png' },
      { label: 'Boxen', i18nId: 'header.nav.furniture.box', link: '/product-list/gartenmoebel-boxen', iconFilename: 'gartenbox.png' }

    ]
  },
  {
    label: 'Sonnenschutz',
    i18nId: 'header.nav.sunprotection',
    link: '/category/sonnenschutz',
    subItems: [
      { label: 'Markisen', i18nId: 'header.nav.sunprotection.awnings', link: '/product-list/sonnenschutz-markisen', iconFilename: 'Markise.png' },
      { label: 'Sonnenschirme', i18nId: 'header.nav.sunprotection.umbrellas', link: '/product-list/sonnenschutz-sonnenschirme', iconFilename: 'Sonnenschirm.png' },
      { label: 'Zubehör', i18nId: 'header.nav.sunprotection.accessories', link: '/product-list/sonnenschutz-zubehoer', iconFilename: 'schrimzubehoer.png' } // Label gekürzt
    ]
  },
  {
    label: 'Wasser im Garten',
    i18nId: 'header.nav.water',
    link: '/category/wasser-im-garten',
    subItems: [
      { label: 'Pools', i18nId: 'header.nav.water.pools', link: '/product-list/wasser-im-garten-pools', iconFilename: 'Pool.png' },
      { label: 'Teichzubehör', i18nId: 'header.nav.water.pondAccessories', link: '/product-list/wasser-im-garten-teichzubehoer', iconFilename: 'teichzubehoer.png' },
      { label: 'Poolzubehör', i18nId: 'header.nav.water.poolAccessories', link: '/product-list/wasser-im-garten-poolzubehoer', iconFilename: 'pollzubehoer.png' }
    ]
  },
  {
    label: 'Heizen & Feuer',
    i18nId: 'header.nav.heating',
    link: '/category/heizen-feuer',
    subItems: [
      { label: 'Kamine', i18nId: 'header.nav.heating.fireplaces', link: '/product-list/heizen-feuer-kamine', iconFilename: 'Feuer.png' },
      { label: 'Feuerholzaufbewahrung', i18nId: 'header.nav.heating.firewoodstorage', link: '/product-list/heizen-feuer-feuerholzaufbewahrung', iconFilename: 'Holz.png' },
      { label: 'Zubehör', i18nId: 'header.nav.heating.heaters', link: '/product-list/heizen-feuer-zubehoer', iconFilename: 'holzzubehoer.png' }

    ]
  },
  {
    label: 'Gartenhelfer & Aufbewahrung',
    i18nId: 'header.nav.gardenhelpers',
    link: '/category/gartenhelfer-aufbewahrung',
    subItems: [
      { label: 'Gartengeräte', i18nId: 'header.nav.gardenhelpers.tools', link: '/product-list/gartenhelfer-aufbewahrung-gartengeraete', iconFilename: 'Maeher.png' },
      { label: 'Gartenschuppen', i18nId: 'header.nav.gardenhelpers.sheds', link: '/product-list/gartenhelfer-aufbewahrung-gartenschuppen', iconFilename: 'schuppen.png' },
      { label: 'Komposter', i18nId: 'header.nav.gardenhelpers.composters', link: '/product-list/gartenhelfer-aufbewahrung-komposter', iconFilename: 'BIO.png' },
      { label: 'Regentonnen', i18nId: 'header.nav.gardenhelpers.waterbutts', link: '/product-list/gartenhelfer-aufbewahrung-regentonnen', iconFilename: 'regentonne.png' },
      { label: 'Gartenwerkzeug', i18nId: 'header.nav.gardenhelpers.toolstorage', link: '/product-list/gartenhelfer-aufbewahrung-werkzeug', iconFilename: 'werkzeug.png' }
    ]
  },
  {
    label: 'Dekoration & Licht',
    i18nId: 'header.nav.deco',
    link: '/category/deko-licht',
    subItems: [
      { label: 'Gartenbeleuchtung', i18nId: 'header.nav.deco.lighting', link: '/product-list/deko-licht-gartenbeleuchtung', iconFilename: 'Lampe.png' },
      { label: 'Gartenlautsprecher' , i18nId: 'header.nav.deco.audio', link: '/product-list/deko-licht-audio', iconFilename: 'audio.png' },
      { label: 'Gartendeko', i18nId: 'header.nav.deco.decoration', link: '/product-list/deko-licht-gartendeko', iconFilename: 'Deko.png' },
      { label: 'Gartenteppiche', i18nId: 'header.nav.deco.rugs', link: '/product-list/deko-licht-gartenteppiche', iconFilename: 'Teppich.png' },
      { label: 'Weihnachtsdeko', i18nId: 'header.nav.deco.christmas', link: '/product-list/deko-licht-weihnachtsdeko', iconFilename: 'weihnacht.png' }
      // Pflanzgefäße fehlte im Screenshot für deko-licht
    ]
  },
  {
    label: 'Pflanzen & Anzucht',
    i18nId: 'header.nav.plants',
    link: '/category/pflanzen-anzucht',
    subItems: [
      { label: 'Gewächshäuser', i18nId: 'header.nav.plants.greenhouses', link: '/product-list/pflanzen-anzucht-gewaechshaeuser', iconFilename: 'Gewaechs.png' },
      { label: 'Hochbeete', i18nId: 'header.nav.plants.raisedbeds', link: '/product-list/pflanzen-anzucht-hochbeet', iconFilename: 'gatenbox.png' },
      { label: 'Tische', i18nId: 'header.nav.plants.tables', link: '/product-list/pflanzen-anzucht-tische', iconFilename: 'planztisch.png' }, // Slug vom Screenshot hat "-tische"
      { label: 'Ständer', i18nId: 'header.nav.plants.stands', link: '/product-list/pflanzen-anzucht-staender', iconFilename: 'staender.png' }, // Slug vom Screenshot hat "-staender"
      { label: 'Kunstpflanzen', i18nId: 'header.nav.plants.artificial', link: '/product-list/pflanzen-anzucht-kunstpflanzen', iconFilename: 'kunst.png' },
      { label: 'Pflanzenschutz', i18nId: 'header.nav.plants.protection', link: '/product-list/pflanzen-anzucht-pflanzenschutz', iconFilename: 'Schutz.png' },
      { label: 'Pflanzgefäße', i18nId: 'header.nav.plants.planters', link: '/product-list/pflanzen-anzucht-pflanzgefaesse', iconFilename: 'Topf.png' },
      { label: 'Rankhilfen', i18nId: 'header.nav.plants.trellises', link: '/product-list/pflanzen-anzucht-rankhilfen', iconFilename: 'ranken.png' },
      { label: 'Bewässerung', i18nId: 'header.nav.plants.irrigation', link: '/product-list/pflanzen-ansucht-bewaesserung', iconFilename: 'bewaesserung.png' },
    ]
  },
  {
    label: 'Spiel & Spaß',
    i18nId: 'header.nav.playfun',
    link: '/category/fuer-die-ganze-grossen', // Behalte den Slug aus dem Screenshot für die Hauptkategorie
    subItems: [
      { label: 'Sandkästen', i18nId: 'header.nav.playfun.sandpits', link: '/product-list/fuer-die-ganze-grossen-sandkasten', iconFilename: 'sandkasten.png' },
      { label: 'Spielburgen', i18nId: 'header.nav.playfun.playcastles', link: '/product-list/fuer-die-ganze-grossen-spielburgen', iconFilename: 'spielburgen.png' }, // Slug vom Screenshot hat "-spielburgen"
      { label: 'Schaukeln', i18nId: 'header.nav.playfun.swings', link: '/product-list/fuer-die-ganze-grossen-schaukeln', iconFilename: 'schukel.png' },
      { label: 'Trampoline', i18nId: 'header.nav.playfun.trampolines', link: '/product-list/fuer-die-ganze-grossen-trampoline', iconFilename: 'trampo.png' },
      { label: 'Zubehör', i18nId: 'header.nav.playfun.accessories', link: '/product-list/fuer-die-ganze-grossen-zubehoer', iconFilename: 'trampozubehoer.png' } // Label gekürzt
    ]
  }
];