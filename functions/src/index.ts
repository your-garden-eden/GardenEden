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
      const locationQuery = request.query.location || "Berlin";
      const params = {
        key: WEATHER_API_KEY,
        q: locationQuery,
        lang: "de",
        aqi: "no",
      };
      try {
        logger.info("Frage WeatherAPI an für:", locationQuery);
        const weatherResponse = await axios.get(WEATHER_API_ENDPOINT, {params});
        if (weatherResponse.data && weatherResponse.data.current) {
          logger.info("WeatherAPI Erfolg für:", locationQuery);
          const currentData = weatherResponse.data.current;
          const locationData = weatherResponse.data.location;
          const iconUrl = currentData.condition.icon.startsWith("//") ?
            "https:" + currentData.condition.icon :
            currentData.condition.icon;
          const weatherResult = {
            locationName: locationData.name,
            country: locationData.country,
            tempCelsius: currentData.temp_c,
            description: currentData.condition.text,
            iconUrl: iconUrl,
            lastUpdated: currentData.last_updated,
          };
          response.status(200).send(weatherResult);
        } else {
          logger.error(
            "WeatherAPI Fehler: Keine 'current' Daten.", weatherResponse.data
          );
          response.status(500)
            .send({error: "Fehler beim Abrufen der Wetterdaten."});
        }
      } catch (error: any) {
        logger.error(
          `Axios Fehler WeatherAPI für ${locationQuery}:`,
          error.response?.data || error.message
        );
        const statusCode = error.response?.status || 500;
        const errorData = error.response?.data?.error;
        const errorMessage = errorData?.message || "Verb.-fehler Wetterdienst.";
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