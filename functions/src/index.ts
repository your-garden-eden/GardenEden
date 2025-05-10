import * as functions from "firebase-functions/v1";
import axios from "axios";
import * as logger from "firebase-functions/logger";
import cors from "cors";

const allowedOrigins = [
  "http://localhost:4200",
  "https://your-garden-eden.web.app",
  "https://www.your-garden-eden.de",
];
const corsHandler = cors({origin: allowedOrigins});

// NEWS_API_KEY und NEWS_API_ENDPOINT bleiben unverändert
const NEWS_API_KEY = functions.config().newsapi?.key;
const NEWS_API_ENDPOINT = "https://newsapi.org/v2/everything";
const WEATHER_API_KEY = functions.config().weatherapi?.key;
const WEATHER_API_ENDPOINT = "http://api.weatherapi.com/v1/current.json";

// getGardenNews bleibt unverändert (hier zur Vollständigkeit)
export const getGardenNews = functions
  .region("europe-west1")
  .https.onRequest((request, response) => {
    corsHandler(request, response, async () => {
      if (!NEWS_API_KEY) {
        logger.error("NewsAPI Key nicht konfiguriert!");
        response.status(500).send({error: "Serverkonfigurationsfehler."});
        return;
      }
      const searchTerms =
        "\"Garten\" OR \"gardening\" OR \"Pflanzen\" OR \"Gartenarbeit\"";
      const params = {
        q: searchTerms,
        language: "de",
        pageSize: 6,
        sortBy: "relevancy",
        apiKey: NEWS_API_KEY,
      };
      try {
        logger.info("Frage NewsAPI an:", params);
        const newsApiResponse = await axios.get(NEWS_API_ENDPOINT, {params});
        if (newsApiResponse.data?.status === "ok") {
          logger.info(
            `NewsAPI Erfolg: ${newsApiResponse.data.totalResults} Artikel`
          );
          response.status(200).send({articles: newsApiResponse.data.articles});
        } else {
          logger.error("NewsAPI Fehler:", newsApiResponse.data);
          response.status(500).send({error: "Fehler bei Nachrichtenquelle."});
        }
      } catch (error: any) {
        logger.error("Axios Fehler NewsAPI:", error.message);
        response.status(500)
          .send({error: "Verbindungsfehler Nachrichtendienst."});
      }
    });
  });


export const getWeatherData = functions
  .region("europe-west1")
  .https.onRequest((request, response) => {
    corsHandler(request, response, async () => {
      if (!WEATHER_API_KEY) {
        logger.error("WeatherAPI Key nicht konfiguriert!");
        response.status(500)
          .send({error: "Serverkonfigurationsfehler (Wetter)."});
        return;
      }

      let locationQueryValue: string | undefined = request.query.location as string;
      let autoDetectedLocation = false;

      // Wenn kein 'location'-Parameter explizit übergeben wurde,
      // versuche die IP des Clients zu verwenden.
      if (!locationQueryValue) {
        let clientIp = request.ip;
        const xff = request.headers["x-forwarded-for"];
        if (typeof xff === "string") {
          clientIp = xff.split(",")[0].trim();
        } else if (Array.isArray(xff) && xff.length > 0) {
          clientIp = xff[0].trim();
        }

        logger.info(`Ermittelte Client IP für WeatherAPI: ${clientIp}`);

        // Übergebe die IP an WeatherAPI, wenn sie gültig aussieht
        // WeatherAPI kann "auto:ip" oder direkt die IP verarbeiten.
        // Wir übergeben direkt die IP.
        if (clientIp && clientIp !== "127.0.0.1" && clientIp !== "::1" && !clientIp.startsWith("192.168.") && !clientIp.startsWith("10.")) {
          locationQueryValue = clientIp;
          autoDetectedLocation = true;
          logger.info(`Verwende Client IP "${clientIp}" für WeatherAPI Anfrage.`);
        } else {
          logger.info("Client IP ist lokal oder nicht vorhanden, verwende Fallback-Standort.");
          // Fallback auf einen Standardort, wenn keine IP ermittelt werden konnte oder sie lokal ist
          locationQueryValue = "Berlin"; // Dein Standard-Fallback
        }
      }

      // Falls immer noch kein Wert (sollte durch Fallback nicht passieren, aber sicher ist sicher)
      if (!locationQueryValue) {
          locationQueryValue = "Berlin";
          logger.warn("Kein Standort ermittelbar, finaler Fallback auf Berlin.");
      }

      const params = {
        key: WEATHER_API_KEY,
        q: locationQueryValue, // Kann jetzt Stadtname oder IP-Adresse sein
        lang: "de",
        aqi: "no",
      };

      try {
        logger.info("Frage WeatherAPI an für:", locationQueryValue);
        const weatherResponse = await axios.get(WEATHER_API_ENDPOINT, {params});

        if (weatherResponse.data && weatherResponse.data.current) {
          logger.info("WeatherAPI Erfolg für:", locationQueryValue, weatherResponse.data.location.name);
          const currentData = weatherResponse.data.current;
          const locationData = weatherResponse.data.location;
          const iconUrl = currentData.condition.icon.startsWith("//") ?
            "https:" + currentData.condition.icon :
            currentData.condition.icon;

          const weatherResult = {
            locationName: locationData.name, // Dieser Name kommt von WeatherAPI basierend auf q
            country: locationData.country,
            tempCelsius: currentData.temp_c,
            description: currentData.condition.text,
            iconUrl: iconUrl,
            lastUpdated: currentData.last_updated,
            autoDetected: autoDetectedLocation && locationData.name !== "Berlin" // Zeigt an, ob Auto-Detection (nicht der Standard-Fallback) aktiv war
          };
          response.status(200).send(weatherResult);
        } else {
          logger.error(
            "WeatherAPI Fehler: Keine 'current' Daten oder ungültige Antwort.", weatherResponse.data
          );
          response.status(500)
            .send({error: "Fehler beim Abrufen der Wetterdaten."});
        }
      } catch (error: any) {
        logger.error(
          `Axios Fehler WeatherAPI für "${locationQueryValue}":`,
          error.response?.data || error.message
        );
        // Spezifische Fehlerbehandlung für den Fall, dass WeatherAPI die IP nicht auflösen kann
        // Error code 1006: No location found matching parameter 'q'
        if (error.response?.data?.error?.code === 1006 && autoDetectedLocation) {
            logger.warn(`WeatherAPI konnte die IP ${locationQueryValue} nicht auflösen. Versuche Fallback...`);
            // Hier könntest du einen erneuten Versuch mit dem Fallback "Berlin" starten
            // oder direkt einen Fehler mit Hinweis zurückgeben.
            // Für Einfachheit: gib einen spezifischeren Fehler zurück oder nutze den Standard-Fallback.
            // In diesem Beispiel lassen wir es auf den generischen Fehler hinauslaufen,
            // aber du könntest hier einen zweiten API-Call mit 'Berlin' machen.
            // response.status(404).send({ error: "Standort konnte nicht automatisch ermittelt werden." });
            // Alternativ: direkter Fallback (nicht implementiert, um Schleifen zu vermeiden, besser klare Fehler)
        }

        const statusCode = error.response?.status || 500;
        const errorData = error.response?.data?.error;
        const errorMessage = errorData?.message || "Verbindungsfehler Wetterdienst.";
        response.status(statusCode).send({error: errorMessage});
      }
    });
  });

/*
export const ssryourgardeneden = functions
    .region("europe-west1")
    .https.onRequest(async (req, res) => {

    });
*/