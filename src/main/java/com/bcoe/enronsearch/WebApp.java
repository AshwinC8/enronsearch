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
                String excludeSpamParam = request.queryParams("excludeSpam");
                String tags = request.queryParams("tags");
                int from = fromParam != null ? Integer.parseInt(fromParam) : 0;
                int size = sizeParam != null ? Integer.parseInt(sizeParam) : 30;
                String sort = sortParam != null ? sortParam : "asc";
                boolean excludeSpam = !"false".equalsIgnoreCase(excludeSpamParam);
                return es.search( request.queryParams("q"), from, size, sort, excludeSpam, tags ).toString();
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
                String excludeSpamParam = request.queryParams("excludeSpam");
                String tags = request.queryParams("tags");
                int from = fromParam != null ? Integer.parseInt(fromParam) : 0;
                int size = sizeParam != null ? Integer.parseInt(sizeParam) : 30;
                String sort = sortParam != null ? sortParam : "asc";
                boolean excludeSpam = !"false".equalsIgnoreCase(excludeSpamParam);
                return es.browse(from, size, sort, excludeSpam, tags).toString();
            }
        });

        // Get all unique tags
        get(new Route("/tags") {
            @Override
            public Object handle(Request request, Response response) {
                response.type("application/json");
                java.util.List<String> tags = es.getAllTags();
                StringBuilder sb = new StringBuilder("[");
                for (int i = 0; i < tags.size(); i++) {
                    if (i > 0) sb.append(",");
                    sb.append("\"").append(tags.get(i)).append("\"");
                }
                sb.append("]");
                return sb.toString();
            }
        });

        // Get a single email by ID
        get(new Route("/email/:id") {
            @Override
            public Object handle(Request request, Response response) {
                response.type("application/json");
                String id = request.params(":id");
                return es.getEmail(id).getSourceAsString();
            }
        });

        // Add tag to an email
        post(new Route("/tag") {
            @Override
            public Object handle(Request request, Response response) {
                response.type("application/json");
                String emailId = request.queryParams("emailId");
                String tag = request.queryParams("tag");
                if (emailId == null || tag == null) {
                    response.status(400);
                    return "{\"error\": \"emailId and tag are required\"}";
                }
                es.addTag(emailId, tag.toLowerCase().trim());
                return "{\"success\": true}";
            }
        });

        // Remove tag from an email
        post(new Route("/untag") {
            @Override
            public Object handle(Request request, Response response) {
                response.type("application/json");
                String emailId = request.queryParams("emailId");
                String tag = request.queryParams("tag");
                if (emailId == null || tag == null) {
                    response.status(400);
                    return "{\"error\": \"emailId and tag are required\"}";
                }
                es.removeTag(emailId, tag.toLowerCase().trim());
                return "{\"success\": true}";
            }
        });

        // Set spam status for an email
        post(new Route("/spam") {
            @Override
            public Object handle(Request request, Response response) {
                response.type("application/json");
                String emailId = request.queryParams("emailId");
                String isSpamParam = request.queryParams("isSpam");
                if (emailId == null) {
                    response.status(400);
                    return "{\"error\": \"emailId is required\"}";
                }
                boolean isSpam = !"false".equalsIgnoreCase(isSpamParam);
                es.setSpam(emailId, isSpam);
                return "{\"success\": true}";
            }
        });

        // Get spam emails
        get(new Route("/spam-emails") {
            @Override
            public Object handle(Request request, Response response) {
                response.type("application/json");
                String fromParam = request.queryParams("from");
                String sizeParam = request.queryParams("size");
                int from = fromParam != null ? Integer.parseInt(fromParam) : 0;
                int size = sizeParam != null ? Integer.parseInt(sizeParam) : 30;
                return es.getSpamEmails(from, size).toString();
            }
        });

        // Get spam count
        get(new Route("/spam-count") {
            @Override
            public Object handle(Request request, Response response) {
                response.type("application/json");
                return "{\"count\": " + es.getSpamCount() + "}";
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