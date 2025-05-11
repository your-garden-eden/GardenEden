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
    isExpanded?: boolean;
  }

  // --- EXPORTIERTE NAVIGATIONSDATEN ---
  export const navItems: NavItem[] = [
    { label: 'Home', i18nId: 'header.nav.home', link: '/' },
    {
      label: 'Gartenmöbel', i18nId: 'header.nav.furniture',
      link: '/category/gartenmoebel',
      subItems: [
        { label: 'Sofas & Lounges', i18nId: 'header.nav.furniture.sofas', link: '/product-list/gartenmoebel-sofas-lounges', iconFilename: 'Lounges.png' },
        { label: 'Stühle & Sessel', i18nId: 'header.nav.furniture.chairs', link: '/product-list/gartenmoebel-stuehle-sessel', iconFilename: 'GartenSessel.png' },
        { label: 'Gartentische', i18nId: 'header.nav.furniture.tables', link: '/product-list/gartenmoebel-tische', iconFilename: 'Tsch.png' },
        { label: 'Bänke', i18nId: 'header.nav.furniture.benches', link: '/product-list/gartenmoebel-baenke', iconFilename: 'Bank.png' },
        { label: 'Liegen & Betten', i18nId: 'header.nav.furniture.loungers', link: '/product-list/gartenmoebel-liegen-betten', iconFilename: 'Sonnenliege.png' },
        { label: 'Hängematten & Schaukeln', i18nId: 'header.nav.furniture.hammocks', link: '/product-list/gartenmoebel-haengematten-schaukeln', iconFilename: 'Hollywood.png' },
        { label: 'Möbel-Sets', i18nId: 'header.nav.furniture.sets', link: '/product-list/gartenmoebel-moebel-sets', iconFilename: 'Moebelset.png' },
        { label: 'Schutzhüllen', i18nId: 'header.nav.furniture.covers', link: '/product-list/gartenmoebel-schutzhuellen', iconFilename: 'Schutzhuelle.png' }
      ]
    },
    {
      label: 'Sonnenschutz', i18nId: 'header.nav.sunprotection',
      link: '/category/sonnenschutz',
      subItems: [
        { label: 'Pavillons & Zelte', i18nId: 'header.nav.sunprotection.pavilions', link: '/product-list/sonnenschutz-pavillons-zelte', iconFilename: 'pavillion.png' },
        { label: 'Sonnenschirme & Segel', i18nId: 'header.nav.sunprotection.umbrellas', link: '/product-list/sonnenschutz-sonnenschirme-segel', iconFilename: 'Sonnenschirm.png' },
        { label: 'Markisen', i18nId: 'header.nav.sunprotection.awnings', link: '/product-list/sonnenschutz-markisen', iconFilename: 'Markise.png' }
      ]
    },
     {
      label: 'Wasser im Garten', i18nId: 'header.nav.water',
      link: '/category/wasser-im-garten',
      subItems: [
        { label: 'Pools & Zubehör', i18nId: 'header.nav.water.pools', link: '/product-list/wasser-im-garten-pools', iconFilename: 'Pool.png' },
        { label: 'Teiche & Zubehör', i18nId: 'header.nav.water.ponds', link: '/product-list/wasser-im-garten-teiche', iconFilename: 'Teich.png' }
      ]
    },
    {
      label: 'Heizen & Feuer', i18nId: 'header.nav.heating',
      link: '/category/heizen-feuer',
      subItems: [
        { label: 'Kamine & Feuerschalen', i18nId: 'header.nav.heating.fireplaces', link: '/product-list/heizen-feuer-kamine-feuerschalen', iconFilename: 'Feuer.png' },
        { label: 'Feuerholzaufbewahrung', i18nId: 'header.nav.heating.storage', link: '/product-list/heizen-feuer-feuerholzaufbewahrung', iconFilename: 'Holz.png' }
      ]
    },
     {
      label: 'Gartenpflege & Geräte', i18nId: 'header.nav.maintenance',
      link: '/category/gartenpflege-geraete',
      subItems: [
        { label: 'Gartengeräte', i18nId: 'header.nav.maintenance.tools', link: '/product-list/gartenpflege-geraete-gartengeraete', iconFilename: 'Maeher.png' },
        { label: 'Aufbewahrungboxen', i18nId: 'header.nav.maintenance.storage', link: '/product-list/gartenpflege-geraete-aufbewahrung', iconFilename: 'Box.png' },
        { label: 'Komposter & Regentonnen', i18nId: 'header.nav.maintenance.compost', link: '/product-list/gartenpflege-geraete-komposter-regentonnen', iconFilename: 'BIO.png' }
      ]
    },
    {
      label: 'Dekoration & Licht', i18nId: 'header.nav.deco',
      link: '/category/deko-licht',
      subItems: [
        { label: 'Gartendeko', i18nId: 'header.nav.deco.deco', link: '/product-list/deko-licht-gartendeko', iconFilename: 'Deko.png' },
        { label: 'Außenbeleuchtung', i18nId: 'header.nav.deco.lighting', link: '/product-list/deko-licht-aussenbeleuchtung', iconFilename: 'Lampe.png' },
        { label: 'Pflanzgefäße & Ständer', i18nId: 'header.nav.deco.planters', link: '/product-list/deko-licht-pflanzgefaesse-staender', iconFilename: 'Topf.png' },
        { label: 'Gartenteppiche', i18nId: 'header.nav.deco.rugs', link: '/product-list/deko-licht-gartenteppiche', iconFilename: 'Teppich.png' }
      ]
    },
     {
      label: 'Pflanzen & Anzucht', i18nId: 'header.nav.plants',
      link: '/category/pflanzen-anzucht',
      subItems: [
        { label: 'Kunstpflanzen', i18nId: 'header.nav.plants.artificial', link: '/product-list/pflanzen-anzucht-kunstpflanzen', iconFilename: 'kunst.png' },
        { label: 'Rasensamen & Anzuchtshilfe', i18nId: 'header.nav.plants.real', link: '/product-list/pflanzen-anzucht-echte-pflanzen', iconFilename: 'Rasen.png' },
        { label: 'Gewächshäuser', i18nId: 'header.nav.plants.greenhouses', link: '/product-list/pflanzen-anzucht-gewaechshaeuser', iconFilename: 'Gewaechs.png' },
        { label: 'Rankhilfen', i18nId: 'header.nav.plants.trellises', link: '/product-list/pflanzen-anzucht-rankhilfen', iconFilename: 'ranken.png' },
        { label: 'Pflanzenschutz', i18nId: 'header.nav.plants.protection', link: '/product-list/pflanzen-anzucht-pflanzenschutz', iconFilename: 'Schutz.png' }
      ]
    },
    {
      label: 'Freizeit & Tierwelt', i18nId: 'header.nav.leisure',
      link: '/category/freizeit-tierwelt',
      subItems: [
        { label: 'Spielgeräte', i18nId: 'header.nav.leisure.play', link: '/product-list/freizeit-tierwelt-spielgeraete', iconFilename: 'sandkasten.png' },
        { label: 'Tierhäuser & Futterplätze', i18nId: 'header.nav.leisure.animal', link: '/product-list/freizeit-tierwelt-tierbedarf', iconFilename: 'Hund.png' }
      ]
    }
  ];