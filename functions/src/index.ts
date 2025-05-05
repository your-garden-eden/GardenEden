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

export const getGardenNews = functions
  .region("europe-west1")
  .https.onRequest((request, response) => {
    corsHandler(request, response, async () => {
      if (!NEWS_API_KEY) {
        logger.error(
          "NewsAPI Key ist nicht in der Functions Konfiguration gesetzt!"
        );
        response.status(500).send({error: "Serverkonfigurationsfehler."});
        return;
      }
      const searchTerms =
        // eslint-disable-next-line max-len
        "\"Garten\" OR \"gardening\" OR \"Pflanzen\" OR \"Gartenarbeit\"";
      const params = {
        q: searchTerms,
        language: "de",
        pageSize: 6,
        sortBy: "relevancy",
        apiKey: NEWS_API_KEY,
      };
      try {
        logger.info("Frage NewsAPI an mit Parametern:", params);
        const newsApiResponse = await axios.get(NEWS_API_ENDPOINT, {params});
        if (newsApiResponse.data && newsApiResponse.data.status === "ok") {
          logger.info(
            `NewsAPI Anfrage erfolgreich, ${
              newsApiResponse.data.totalResults
            } Artikel gefunden (max ${params.pageSize} zurückgegeben).`
          );
          response.status(200).send({articles: newsApiResponse.data.articles});
        } else {
          logger.error(
            "NewsAPI hat einen Fehler oder 'status != ok' zurückgegeben:",
            newsApiResponse.data
          );
          response.status(500).send({
            error: "Fehler beim Abrufen der Nachrichten von der Quelle.",
          });
        }
      } catch (error: any) {
        logger.error(
          "Fehler bei der Axios-Anfrage an NewsAPI:",
          error.message,
          error.response?.data
        );
        response.status(500).send({
          error: "Fehler bei der Verbindung zum Nachrichtendienst.",
        });
      }
    });
  });

/*
export const ssryourgardeneden = functions
    .region("europe-west1")
    .https.onRequest(async (req, res) => {

    });
*/