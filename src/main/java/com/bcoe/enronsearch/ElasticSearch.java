package com.bcoe.enronsearch;

import java.io.IOException;

import org.elasticsearch.client.Client;
import org.elasticsearch.common.xcontent.XContentBuilder;
import org.elasticsearch.common.xcontent.XContentFactory;
import org.elasticsearch.action.admin.indices.create.*;
import org.elasticsearch.action.admin.indices.delete.*;
import org.elasticsearch.action.admin.indices.flush.*;
import org.elasticsearch.action.admin.cluster.health.*;
import org.elasticsearch.common.joda.time.DateTime;
import org.elasticsearch.common.joda.time.format.DateTimeFormat;
import org.elasticsearch.common.joda.time.format.DateTimeFormatter;
import org.elasticsearch.common.joda.time.format.DateTimeFormatterBuilder;
import org.elasticsearch.common.joda.time.format.DateTimeParser;
import org.elasticsearch.common.joda.time.format.ISODateTimeFormat;
import org.elasticsearch.common.settings.*;
import org.elasticsearch.action.search.SearchResponse;
import org.elasticsearch.action.search.SearchType;
import org.elasticsearch.action.get.GetResponse;
import org.elasticsearch.action.update.UpdateRequest;
import org.elasticsearch.index.query.FilterBuilders.*;
import org.elasticsearch.index.query.QueryBuilders;
import org.elasticsearch.index.query.BoolQueryBuilder;
import org.elasticsearch.search.sort.SortOrder;
import org.elasticsearch.client.transport.*;
import org.elasticsearch.common.transport.InetSocketTransportAddress;
import java.util.List;
import java.util.ArrayList;
import java.util.Map;

/*
 Wrapper for ElasticSearch, performs
 searching and indexing tasks.
 */
public class ElasticSearch {

	private static String indexName = "enron-messages";
	private static String mappingName = "message";
	private Client client;
	private static final String DEFAULT_ES_HOST = "localhost";
	private static final int DEFAULT_ES_PORT = 9300;

	public ElasticSearch() {
		ImmutableSettings.Builder clientSettingsBuilder = ImmutableSettings
				.settingsBuilder();
		String envHost = System.getenv("ES_HOST");
		String envPort = System.getenv("ES_PORT");
		String envClusterName = System.getenv("ES_CLUSTER_NAME");
		if(envClusterName!=null){
			clientSettingsBuilder.put("cluster.name", envClusterName);
		}
		client = new TransportClient(clientSettingsBuilder.build())
				.addTransportAddress(new InetSocketTransportAddress(
						envHost != null ? envHost : DEFAULT_ES_HOST,
						envPort != null ? Integer.parseInt(envPort)
								: DEFAULT_ES_PORT));
	}

	public void index() {
		deleteIndex();
		createIndex();
		putMapping();
	}

	private void deleteIndex() {
		try {
			client.admin().indices().delete(new DeleteIndexRequest(indexName))
					.actionGet();
		} catch (Exception e) {
			System.out.println(e);
		}
	}

	private void createIndex() {
		Settings indexSettings = ImmutableSettings.settingsBuilder()
				.put("number_of_shards", 1).put("number_of_replicas", 0)
				.put("analysis.analyzer.default.tokenizer", "uax_url_email")
				.build();

		CreateIndexRequestBuilder createIndexBuilder = client.admin().indices()
				.prepareCreate(indexName);

		createIndexBuilder.setSettings(indexSettings);

		CreateIndexResponse createIndexResponse = createIndexBuilder.execute()
				.actionGet();

		waitForYellow();
	}

	private void waitForYellow() {
		ClusterHealthRequestBuilder healthRequest = client.admin().cluster()
				.prepareHealth();

		healthRequest.setIndices(indexName);
		healthRequest.setWaitForYellowStatus();

		ClusterHealthResponse healthResponse = healthRequest.execute()
				.actionGet();
	}

	private void putMapping() {
		try {

			XContentBuilder mapping = XContentFactory.jsonBuilder()
					.startObject().startObject("message")
						.startObject("properties")
							.startObject("to")
								.field("type", "string")
							.endObject()
							.startObject("from")
								.field("type", "string")
							.endObject()
							.startObject("subject")
								.field("type", "string")
							.endObject()
							.startObject("body")
								.field("type", "string")
							.endObject()
							.startObject("date")
								.field("type", "date")
//								.field("format", "EEE, d MMM yyyy HH:mm:ss Z (z)")
							.endObject()
							.startObject("tags")
								.field("type", "string")
								.field("index", "not_analyzed")
							.endObject()
							.startObject("spam")
								.field("type", "boolean")
							.endObject()
						.endObject()
					.endObject().endObject();

			client.admin().indices().preparePutMapping(indexName)
					.setType(mappingName).setSource(mapping).execute()
					.actionGet();

			flush();
		} catch (IOException e) {
			System.out.println("Failed to put mapping: " + e);
		}
	}

	private void flush() {
		client.admin().indices().flush(new FlushRequest(indexName)).actionGet();
	}

	public void indexMessage(Message message) {
		try {
			DateTimeParser[] parsers = {
					DateTimeFormat.forPattern("EEE, d MMM yyyy HH:mm:ss Z (z)").getParser(),
					DateTimeFormat.forPattern("EEEE, MMMM d, yyyy hh:mm a").getParser()
			};
			DateTimeFormatter fmt = ISODateTimeFormat.dateTime();
			
			DateTimeFormatter formatter = new DateTimeFormatterBuilder().append(null, parsers).toFormatter();
			DateTime dateTime = formatter.parseDateTime(message.getDateString());
			XContentBuilder document = XContentFactory.jsonBuilder()
					.startObject().field("to", message.getTo())
					.field("from", message.getFrom())
					.field("subject", message.getSubject())
					.field("body", message.getBody())
					.field("cc", message.getCc())
					.field("bcc", message.getBcc())
					.field("date", fmt.print(dateTime))
					.endObject();

			client.prepareIndex(indexName, mappingName, message.getId())
					.setSource(document).execute().actionGet();

		} catch (IOException e) {
			System.out.println(e);
		} catch(Exception e) {
			System.out.println("Error parsing date "+message.getDateString()+" for message with subject "+message.getSubject());
			
		}
	}

	public SearchResponse search(String query, int from, int size, String sortOrder) {
		SortOrder order = "desc".equalsIgnoreCase(sortOrder) ? SortOrder.DESC : SortOrder.ASC;
		return client
				.prepareSearch(indexName)
				.setTypes(mappingName)
				.setSearchType(SearchType.DFS_QUERY_THEN_FETCH)
				.setQuery(
						QueryBuilders.queryString(query).field("_all")
								.lenient(true).autoGeneratePhraseQueries(true)
								.analyzeWildcard(true).phraseSlop(10)
								.lowercaseExpandedTerms(false))
				.addSort("date", order)
				.setFrom(from)
				.setSize(size).addHighlightedField("to", 0, 0)
				.addHighlightedField("from", 0, 0).execute().actionGet();
	}

	// Browse all emails sorted by date
	public SearchResponse browse(int from, int size, String sortOrder) {
		SortOrder order = "desc".equalsIgnoreCase(sortOrder) ? SortOrder.DESC : SortOrder.ASC;
		return client
				.prepareSearch(indexName)
				.setTypes(mappingName)
				.setSearchType(SearchType.DFS_QUERY_THEN_FETCH)
				.setQuery(QueryBuilders.matchAllQuery())
				.addSort("date", order)
				.setFrom(from)
				.setSize(size)
				.execute().actionGet();
	}

	// Get a single email by ID
	public GetResponse getEmail(String id) {
		return client.prepareGet(indexName, mappingName, id).execute().actionGet();
	}

	// Add a tag to an email
	@SuppressWarnings("unchecked")
	public void addTag(String emailId, String tag) {
		try {
			GetResponse response = getEmail(emailId);
			if (!response.isExists()) return;

			List<String> tags = (List<String>) response.getSource().get("tags");
			if (tags == null) {
				tags = new ArrayList<>();
			}
			if (!tags.contains(tag)) {
				tags.add(tag);
			}

			UpdateRequest updateRequest = new UpdateRequest(indexName, mappingName, emailId)
				.doc(XContentFactory.jsonBuilder()
					.startObject()
					.field("tags", tags)
					.endObject());
			client.update(updateRequest).actionGet();
		} catch (Exception e) {
			System.out.println("Failed to add tag: " + e);
		}
	}

	// Remove a tag from an email
	@SuppressWarnings("unchecked")
	public void removeTag(String emailId, String tag) {
		try {
			GetResponse response = getEmail(emailId);
			if (!response.isExists()) return;

			List<String> tags = (List<String>) response.getSource().get("tags");
			if (tags == null) return;

			tags.remove(tag);

			UpdateRequest updateRequest = new UpdateRequest(indexName, mappingName, emailId)
				.doc(XContentFactory.jsonBuilder()
					.startObject()
					.field("tags", tags)
					.endObject());
			client.update(updateRequest).actionGet();
		} catch (Exception e) {
			System.out.println("Failed to remove tag: " + e);
		}
	}

	// Set spam status for an email
	public void setSpam(String emailId, boolean isSpam) {
		try {
			UpdateRequest updateRequest = new UpdateRequest(indexName, mappingName, emailId)
				.doc(XContentFactory.jsonBuilder()
					.startObject()
					.field("spam", isSpam)
					.endObject());
			client.update(updateRequest).actionGet();
		} catch (Exception e) {
			System.out.println("Failed to set spam status: " + e);
		}
	}

	// Search with optional spam exclusion
	public SearchResponse search(String query, int from, int size, String sortOrder, boolean excludeSpam) {
		SortOrder order = "desc".equalsIgnoreCase(sortOrder) ? SortOrder.DESC : SortOrder.ASC;

		BoolQueryBuilder boolQuery = QueryBuilders.boolQuery()
			.must(QueryBuilders.queryString(query).field("_all")
				.lenient(true).autoGeneratePhraseQueries(true)
				.analyzeWildcard(true).phraseSlop(10)
				.lowercaseExpandedTerms(false));

		if (excludeSpam) {
			boolQuery.mustNot(QueryBuilders.termQuery("spam", true));
		}

		return client
				.prepareSearch(indexName)
				.setTypes(mappingName)
				.setSearchType(SearchType.DFS_QUERY_THEN_FETCH)
				.setQuery(boolQuery)
				.addSort("date", order)
				.setFrom(from)
				.setSize(size).addHighlightedField("to", 0, 0)
				.addHighlightedField("from", 0, 0).execute().actionGet();
	}

	// Browse with optional spam exclusion
	public SearchResponse browse(int from, int size, String sortOrder, boolean excludeSpam) {
		SortOrder order = "desc".equalsIgnoreCase(sortOrder) ? SortOrder.DESC : SortOrder.ASC;

		BoolQueryBuilder boolQuery = QueryBuilders.boolQuery()
			.must(QueryBuilders.matchAllQuery());

		if (excludeSpam) {
			boolQuery.mustNot(QueryBuilders.termQuery("spam", true));
		}

		return client
				.prepareSearch(indexName)
				.setTypes(mappingName)
				.setSearchType(SearchType.DFS_QUERY_THEN_FETCH)
				.setQuery(boolQuery)
				.addSort("date", order)
				.setFrom(from)
				.setSize(size)
				.execute().actionGet();
	}

	// Get all spam emails
	public SearchResponse getSpamEmails(int from, int size) {
		return client
				.prepareSearch(indexName)
				.setTypes(mappingName)
				.setSearchType(SearchType.DFS_QUERY_THEN_FETCH)
				.setQuery(QueryBuilders.termQuery("spam", true))
				.addSort("date", SortOrder.DESC)
				.setFrom(from)
				.setSize(size)
				.execute().actionGet();
	}

	// Get count of spam emails
	public long getSpamCount() {
		SearchResponse response = client
				.prepareSearch(indexName)
				.setTypes(mappingName)
				.setSearchType(SearchType.COUNT)
				.setQuery(QueryBuilders.termQuery("spam", true))
				.execute().actionGet();
		return response.getHits().getTotalHits();
	}

	public void cleanup() {
		client.close();
	}
}
