import * as functions from "firebase-functions/v1";
import axios, {AxiosError} from "axios";
import * as logger from "firebase-functions/logger";
import cors from "cors";

const allowedOrigins = [
  "http://localhost:4200",
  "https://your-garden-eden.web.app",
  "https://www.your-garden-eden.de",
];
const corsHandler = cors({origin: allowedOrigins});

const NEWS_API_KEY = functions.config().newsapi?.key;
const NEWS_API_ENDPOINT = "https://newsapi.org/v2/everything";
const WEATHER_API_KEY = functions.config().weatherapi?.key;
const WEATHER_API_ENDPOINT = "http://api.weatherapi.com/v1/current.json";

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
            `NewsAPI Erfolg: ${newsApiResponse.data.totalResults} Artikel`,
          );
          response.status(200).send({articles: newsApiResponse.data.articles});
        } else {
          logger.error("NewsAPI Fehler:", newsApiResponse.data);
          response.status(500).send({error: "Fehler bei Nachrichtenquelle."});
        }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        const axiosError = error as AxiosError;
        logger.error(
          "Axios Fehler NewsAPI:",
          axiosError.message,
          axiosError.response?.data,
        );
        response.status(axiosError.response?.status || 500)
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

      let locationQueryValue = request.query.location as string | undefined;
      let autoDetectedLocation = false;

      if (!locationQueryValue) {
        let clientIp = request.ip;
        const xff = request.headers["x-forwarded-for"];
        if (typeof xff === "string") {
          clientIp = xff.split(",")[0].trim();
        } else if (Array.isArray(xff) && xff.length > 0) {
          clientIp = xff[0].trim();
        }

        logger.info(`Ermittelte Client IP für WeatherAPI: ${clientIp}`);

        const isLocalIp = !clientIp || clientIp === "127.0.0.1" ||
                          clientIp === "::1" ||
                          clientIp.startsWith("192.168.") ||
                          clientIp.startsWith("10.");

        if (!isLocalIp) {
          locationQueryValue = clientIp;
          autoDetectedLocation = true;
          logger.info(
            `Verwende Client IP "${clientIp}" für WeatherAPI Anfrage.`,
          );
        } else {
          logger.info(
            "Client IP lokal/nicht vorhanden, verwende Fallback.",
          );
          locationQueryValue = "Berlin";
        }
      }

      if (!locationQueryValue) {
        locationQueryValue = "Berlin";
        logger.warn("Kein Standort ermittelbar, finaler Fallback Berlin.");
      }

      const params = {
        key: WEATHER_API_KEY,
        q: locationQueryValue,
        lang: "de",
        aqi: "no",
      };

      try {
        logger.info("Frage WeatherAPI an für:", locationQueryValue);
        const weatherResponse = await axios.get(WEATHER_API_ENDPOINT, {params});

        if (weatherResponse.data && weatherResponse.data.current) {
          logger.info(
            "WeatherAPI Erfolg für:",
            locationQueryValue,
            weatherResponse.data.location.name,
          );
          const currentData = weatherResponse.data.current;
          const locationData = weatherResponse.data.location;
          const iconPath = currentData.condition.icon;
          const iconUrl = iconPath.startsWith("//") ?
            "https:" + iconPath : iconPath;

          const weatherResult = {
            locationName: locationData.name,
            country: locationData.country,
            tempCelsius: currentData.temp_c,
            description: currentData.condition.text,
            iconUrl: iconUrl,
            lastUpdated: currentData.last_updated,
            autoDetected: autoDetectedLocation &&
                          locationData.name !== "Berlin",
          };
          response.status(200).send(weatherResult);
        } else {
          logger.error(
            "WeatherAPI Fehler: Keine 'current' Daten.",
            weatherResponse.data,
          );
          response.status(500)
            .send({error: "Fehler beim Abrufen der Wetterdaten."});
        }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        const axiosError = error as AxiosError;
        const errorMsgDetails = axiosError.response?.data || axiosError.message;
        logger.error(
          `Axios Fehler WeatherAPI für "${locationQueryValue}":`,
          errorMsgDetails,
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const errorRespData = axiosError.response?.data as any;
        if (
          errorRespData?.error?.code === 1006 &&
          autoDetectedLocation
        ) {
          logger.warn(
            `WeatherAPI: IP ${locationQueryValue} nicht auflösbar.`,
          );
        }

        const statusCode = axiosError.response?.status || 500;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const errDataForMsg = axiosError.response?.data as any;
        const errMsg = errDataForMsg?.error?.message ||
                       "Verbindungsfehler Wetterdienst.";
        response.status(statusCode).send({
          error: errMsg,
        });
      }
    });
  });

/*
 * Exportiere die SSR-Funktion für Firebase.
 * Diese Funktion wird durch 'firebase deploy' bereitgestellt.
 * Stelle sicher, dass deine Angular Universal ssr-engine korrekt
 * exportiert und hier aufgerufen wird.
 */
// export const ssryourgardeneden = functions
//   .region("europe-west1")
//   .https.onRequest(async (req, res) => {
//     // Beispielhafter Aufruf, ersetze dies durch deine SSR Logik
//     // const { ssrEngine } = await import('./ssr-engine'); // Pfad anpassen
//     // return ssrEngine(req, res);
//     logger.info("SSR Request:", req.path);
//     res.send("SSR placeholder - bitte implementieren");
//   });