package com.bcoe.enronsearch;

import static spark.Spark.*;
import spark.*;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/*
HTTP API for performing searches on
Enron dataset.
*/
public class WebApp
{
    // Rate limiting: track requests per IP
    private static final Map<String, RateLimitInfo> rateLimitMap = new ConcurrentHashMap<>();
    private static final int MAX_REQUESTS_PER_MINUTE = 60;
    private static final DateTimeFormatter logFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    public static void start() {

        final ElasticSearch es = new ElasticSearch();

        if (System.getenv("PORT") != null) {
            setPort( Integer.parseInt( System.getenv("PORT") ));
        }

        staticFileLocation("/public");

        // Log all requests with IP
        before(new Filter() {
            @Override
            public void handle(Request request, Response response) {
                String ip = getClientIp(request);
                String timestamp = LocalDateTime.now().format(logFormatter);
                String path = request.pathInfo();
                String query = request.queryParams("q");

                System.out.println("[" + timestamp + "] IP: " + ip + " | Path: " + path +
                    (query != null ? " | Query: " + query : ""));

                // Rate limiting check
                if (isRateLimited(ip)) {
                    halt(429, "Rate limit exceeded. Please wait a moment.");
                }
            }
        });

        get(new Route("/search") {
            @Override
            public Object handle(Request request, Response response) {
                response.type("application/json");
                String fromParam = request.queryParams("from");
                String sizeParam = request.queryParams("size");
                String sortParam = request.queryParams("sort");
                int from = fromParam != null ? Integer.parseInt(fromParam) : 0;
                int size = sizeParam != null ? Integer.parseInt(sizeParam) : 30;
                String sort = sortParam != null ? sortParam : "asc";
                return es.search( request.queryParams("q"), from, size, sort ).toString();
            }
        });

        // Browse all emails sorted by date
        get(new Route("/browse") {
            @Override
            public Object handle(Request request, Response response) {
                response.type("application/json");
                String fromParam = request.queryParams("from");
                String sizeParam = request.queryParams("size");
                String sortParam = request.queryParams("sort");
                int from = fromParam != null ? Integer.parseInt(fromParam) : 0;
                int size = sizeParam != null ? Integer.parseInt(sizeParam) : 30;
                String sort = sortParam != null ? sortParam : "asc";
                return es.browse(from, size, sort).toString();
            }
        });

        // Endpoint to view recent IPs (for admin)
        get(new Route("/admin/ips") {
            @Override
            public Object handle(Request request, Response response) {
                String adminKey = System.getenv("ADMIN_KEY");
                if (adminKey != null && !adminKey.equals(request.queryParams("key"))) {
                    halt(403, "Forbidden");
                }
                response.type("text/plain");
                StringBuilder sb = new StringBuilder("Recent IPs:\n");
                for (Map.Entry<String, RateLimitInfo> entry : rateLimitMap.entrySet()) {
                    sb.append(entry.getKey())
                      .append(" - ")
                      .append(entry.getValue().requestCount)
                      .append(" requests\n");
                }
                return sb.toString();
            }
        });
    }

    private static String getClientIp(Request request) {
        // Check for forwarded IP (when behind proxy/Cloudflare)
        String forwardedFor = request.headers("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isEmpty()) {
            return forwardedFor.split(",")[0].trim();
        }
        String cfConnectingIp = request.headers("CF-Connecting-IP");
        if (cfConnectingIp != null && !cfConnectingIp.isEmpty()) {
            return cfConnectingIp;
        }
        return request.ip();
    }

    private static boolean isRateLimited(String ip) {
        long now = Instant.now().getEpochSecond();

        RateLimitInfo info = rateLimitMap.compute(ip, (key, existing) -> {
            if (existing == null || now - existing.windowStart > 60) {
                return new RateLimitInfo(now, 1);
            }
            existing.requestCount++;
            return existing;
        });

        return info.requestCount > MAX_REQUESTS_PER_MINUTE;
    }

    private static class RateLimitInfo {
        long windowStart;
        int requestCount;

        RateLimitInfo(long windowStart, int requestCount) {
            this.windowStart = windowStart;
            this.requestCount = requestCount;
        }
    }
}