import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine, isMainModule } from '@angular/ssr/node';
import express from 'express';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import bootstrap from './main.server';

// NEU: Cookie-Parser importieren
import cookieParser from 'cookie-parser';

import axios from 'axios';
import { SitemapStream, streamToPromise, SitemapItemLoose, EnumChangefreq } from 'sitemap';
import { Readable } from 'stream';
import { navItems } from './app/core/data/navigation.data';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');
const indexHtml = join(serverDistFolder, 'index.server.html');

const app = express();

// NEU: Cookie-Parser als Middleware registrieren, bevor die Routen verarbeitet werden.
app.use(cookieParser());

const commonEngine = new CommonEngine();

// =================================================================
// START: Dynamischer Sitemap-Endpunkt
// =================================================================
const SITEMAP_CACHE_DURATION_MS = 12 * 60 * 60 * 1000;
const HOSTNAME = 'https://www.your-garden-eden.de';
const WC_API_URL = 'https://your-garden-eden-4ujzpfm5qt.live-website.com/wp-json/wc/v3';
let sitemapCache: string | null = null;
let sitemapCacheTimestamp: number = 0;

async function getAllFeaturedProducts(): Promise<SitemapItemLoose[]> {
  const apiKey = process.env['WOOCOMMERCE_API_KEY'];
  const apiSecret = process.env['WOOCOMMERCE_API_SECRET'];

  if (!apiKey || !apiSecret) {
    throw new Error('API credentials (WOOCOMMERCE_API_KEY or WOOCOMMERCE_API_SECRET) are not set in the server environment.');
  }

  const products: SitemapItemLoose[] = [];
  let page = 1; 
  const perPage = 100; 
  let totalPages = 1;
  console.log('Sitemap: Starte Abruf der HERVORGEHOBENEN Produkte via Basic Auth...');
  const authToken = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  
  while (page <= totalPages) {
    try {
      const response = await axios.get(`${WC_API_URL}/products`, {
        params: { per_page: perPage, page, status: 'publish', featured: true, _fields: 'slug,modified_gmt' },
        headers: { 'Authorization': `Basic ${authToken}` }
      });
      if (page === 1) { 
        totalPages = parseInt(response.headers['x-wp-totalpages'] || '1', 10); 
        console.log(`Sitemap: ${response.headers['x-wp-total']} HERVORGEHOBENE Produkte gefunden.`); 
      }
      const productSlugs = response.data.map((product: { slug: string; modified_gmt: string }) => ({
        url: `/product/${product.slug}`, 
        lastmod: product.modified_gmt, 
        changefreq: EnumChangefreq.WEEKLY, 
        priority: 0.9,
      }));
      products.push(...productSlugs); 
      page++;
    } catch (error: any) {
      console.error(`Sitemap: Fehler beim Abrufen der Produkte via Basic Auth:`, error.response ? JSON.stringify(error.response.data) : error.message);
      break; 
    }
  }
  return products;
}

function getAllCategoryUrlsFromFile(): SitemapItemLoose[] {
    const categoryUrls: SitemapItemLoose[] = [];
    navItems.forEach(item => {
        if (item.link && item.link !== '/') { 
            categoryUrls.push({ url: item.link, changefreq: EnumChangefreq.WEEKLY, priority: 0.8 }); 
        }
        item.subItems?.forEach(subItem => { 
            if (subItem.link) { 
                categoryUrls.push({ url: subItem.link, changefreq: EnumChangefreq.WEEKLY, priority: 0.7 }); 
            } 
        });
    });
    return categoryUrls;
}

app.get('/sitemap.xml', async (req, res) => {
  res.header('Content-Type', 'application/xml');
  const now = Date.now();
  if (sitemapCache && (now - sitemapCacheTimestamp < SITEMAP_CACHE_DURATION_MS)) { 
    return res.send(sitemapCache); 
  }
  try {
    console.log("Sitemap: Generiere neue Sitemap...");
    const staticRoutes: SitemapItemLoose[] = [
      { url: '/', changefreq: EnumChangefreq.DAILY, priority: 1.0 }, 
      { url: '/impressum', changefreq: EnumChangefreq.MONTHLY, priority: 0.4 }, 
      { url: '/datenschutz', changefreq: EnumChangefreq.MONTHLY, priority: 0.4 }, 
      { url: '/agb', changefreq: EnumChangefreq.MONTHLY, priority: 0.4 }, 
      { url: '/widerrufsrecht', changefreq: EnumChangefreq.MONTHLY, priority: 0.4 }, 
      { url: '/kontakt', changefreq: EnumChangefreq.MONTHLY, priority: 0.5 }, 
      { url: '/versand', changefreq: EnumChangefreq.MONTHLY, priority: 0.5 }, 
      { url: '/faq', changefreq: EnumChangefreq.WEEKLY, priority: 0.6 }, 
      { url: '/ueber-uns', changefreq: EnumChangefreq.MONTHLY, priority: 0.6 }, 
      { url: '/warenkorb', changefreq: EnumChangefreq.NEVER, priority: 0.1 },
    ];
    const categoryUrls = getAllCategoryUrlsFromFile();
    const productUrls = await getAllFeaturedProducts();
    const allUrls = [...staticRoutes, ...categoryUrls, ...productUrls];
    const smStream = new SitemapStream({ hostname: HOSTNAME });
    const sitemapContent = await streamToPromise(Readable.from(allUrls).pipe(smStream));
    sitemapCache = sitemapContent.toString();
    sitemapCacheTimestamp = Date.now();
    console.log(`Sitemap: Neue Sitemap mit ${allUrls.length} URLs erfolgreich generiert.`);
    return res.send(sitemapCache);
  } catch (error: any) {
    console.error('Sitemap: Unerwarteter Fehler im Haupt-Handler:', error.message);
    return res.status(500).send(`Sitemap Generation Failed: ${error.message}`);
  }
});
// =================================================================
// END: Dynamischer Sitemap-Endpunkt
// =================================================================


// Statische Dateien aus dem Browser-Build-Ordner bereitstellen
app.get('**', express.static(browserDistFolder, { maxAge: '1y', index: 'index.html' }));

// Alle anderen Anfragen werden von der Angular-Engine verarbeitet
app.get('**', (req, res, next) => {
  const { protocol, originalUrl, baseUrl, headers } = req;
  
  commonEngine.render({
    bootstrap,
    documentFilePath: indexHtml,
    url: `${protocol}://${headers.host}${originalUrl}`,
    publicPath: browserDistFolder,
    // KORRIGIERT: Den Request als Provider für die Angular-App bereitstellen
    providers: [
      { provide: APP_BASE_HREF, useValue: baseUrl },
      { provide: 'REQUEST', useValue: req },
      { provide: 'RESPONSE', useValue: res } // Optional, aber gute Praxis
    ],
  }).then((html) => res.send(html)).catch((err) => next(err));
});

if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

export default app;