EnronSearch
===========

A searchable archive of the 500,000 emails in CMU's [Enron corpus](https://www.cs.cmu.edu/~enron/), powered by ElasticSearch.

## Features

- Full-text search across all email fields (to, from, subject, body)
- Modern inbox-style UI with email preview panel
- Sort by date (oldest/newest first)
- Pagination for browsing results
- Bookmark/save emails locally
- HTML and plain text email viewing
- Rate limiting (60 requests/minute per IP)

## Quick Start with Docker

The easiest way to run EnronSearch is with Docker Compose:

```bash
# Clone and start
git clone https://github.com/YOUR_USERNAME/enronsearch.git
cd enronsearch
docker-compose up -d --build

# Wait for ElasticSearch to be ready (about 30 seconds)
# Then download and index the emails (takes several minutes)
docker-compose exec webapp java -cp target/classes:target/dependency/*:./ com.bcoe.enronsearch.Cli --download
docker-compose exec webapp java -cp target/classes:target/dependency/*:./ com.bcoe.enronsearch.Cli --index

# Access at http://localhost:4567
```

## Manual Installation

### Requirements
- Java 8+
- Maven
- ElasticSearch 1.7.x

### Setup

1. Start ElasticSearch and set environment variables:
```bash
export ES_HOST=localhost
export ES_PORT=9300
export ES_CLUSTER_NAME=elasticsearch  # optional
```

2. Build the project:
```bash
mvn package
```

3. Download the Enron corpus (~400MB):
```bash
java -cp target/classes:target/dependency/*:./ com.bcoe.enronsearch.Cli --download
```

4. Index the emails (takes several minutes):
```bash
java -cp target/classes:target/dependency/*:./ com.bcoe.enronsearch.Cli --index
```

5. Start the web server:
```bash
java -cp target/classes:target/dependency/*:./ com.bcoe.enronsearch.Cli --server
```

The app will be available at `http://localhost:4567` (or set `PORT` env var).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ES_HOST` | localhost | ElasticSearch host |
| `ES_PORT` | 9300 | ElasticSearch transport port |
| `ES_CLUSTER_NAME` | - | ElasticSearch cluster name |
| `PORT` | 4567 | Web server port |
| `ADMIN_KEY` | - | Key for /admin/ips endpoint |

## API Endpoints

- `GET /search?q=query&from=0&size=30&sort=asc` - Search emails
- `GET /browse?from=0&size=30&sort=asc` - Browse all emails by date
- `GET /admin/ips?key=ADMIN_KEY` - View connected IPs (requires ADMIN_KEY)

Copyright
=========

Copyright (c) 2013 Benjamin Coe. See LICENSE.txt for
further details.
