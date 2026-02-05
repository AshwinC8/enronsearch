// Enron Email Search — Modern Interface
// Hits Java API and performs searches on Enron dataset

function EnronSearch(opts) {
  _.extend(this, {
    searchInput: null,
    searchResults: null,
    highlights: null,
    terms: null,
    searchTerms: [],
    nonce: 0,
    currentPage: 0,
    pageSize: 30,
    totalResults: 0,
    currentEmail: null,
    sortOrder: 'asc', // 'asc' = oldest first, 'desc' = newest first
    viewMode: 'text', // 'html' or 'text' - default to plain text
    allTags: [], // list of unique tags from results
    activeTagFilters: [], // currently selected tag filters (multi-select)
    currentView: 'search' // 'search' or 'spam'
  }, opts);

  this.loadSpamCount();
  this.loadAllTags();
  this.typeAheadSearch();
  this.clearSearch();
  this.setupPagination();
  this.setupModal();
  this.setupNavigation();
  this.setupSortToggle();
  this.setupTagsAndSpam();

  // Load emails by default (sorted by date)
  this.loadDefaultEmails();
}

// Load all tags from backend
EnronSearch.prototype.loadAllTags = function() {
  var _this = this;
  $.ajax({
    type: 'GET',
    url: '/tags',
    success: function(tags) {
      _this.allTags = tags || [];
    }
  });
};

// Extract initials from email address for avatar
EnronSearch.prototype.getInitials = function(email) {
  if (!email || email === 'undefined' || email === 'null') return '?';
  try {
    var name = email.split('@')[0];
    if (!name || name.length === 0) return '?';
    var parts = name.split(/[._-]/).filter(function(p) { return p && p.length > 0; });
    if (parts.length >= 2 && parts[0][0] && parts[1][0]) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    if (name.length >= 2) {
      return name.substring(0, 2).toUpperCase();
    }
    return name[0] ? name[0].toUpperCase() : '?';
  } catch (e) {
    return '?';
  }
};

// Format email sender for display
EnronSearch.prototype.formatSender = function(email) {
  if (!email || email === 'undefined' || email === 'null') return 'Unknown';
  try {
    var name = email.split('@')[0];
    if (!name) return 'Unknown';
    var parts = name.split(/[._-]/).filter(function(p) { return p && p.length > 0; });
    if (parts.length === 0) return 'Unknown';
    return parts.map(function(p) {
      return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    }).join(' ');
  } catch (e) {
    return 'Unknown';
  }
};

// Format date for display
EnronSearch.prototype.formatDate = function(dateStr) {
  if (!dateStr) return '';
  try {
    var date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    var now = new Date();
    var diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  } catch (e) {
    return '';
  }
};

// Clear current search
EnronSearch.prototype.clearSearch = function() {
  var _this = this;

  $(document).on('click', '.delete-tag', function() {
    var parent = $(this).parents('span'),
      tag = parent.find('.value').text();

    _this.searchTerms = _(_this.searchTerms).filter(function(v) {
      return v !== tag;
    });

    _this.showTerms();
    _this.currentPage = 0;
    _this.search();

    return false;
  });
};

// Setup pagination controls
EnronSearch.prototype.setupPagination = function() {
  var _this = this;

  $('#prev-page').on('click', function() {
    if (_this.currentPage > 0) {
      _this.currentPage--;
      _this.paginateResults();
    }
  });

  $('#next-page').on('click', function() {
    var maxPage = Math.ceil(_this.totalResults / _this.pageSize) - 1;
    if (_this.currentPage < maxPage) {
      _this.currentPage++;
      _this.paginateResults();
    }
  });
};

// Paginate results - use browse if no query, search otherwise
EnronSearch.prototype.paginateResults = function() {
  var terms = [].concat(this.searchTerms);
  if (this.searchInput.val()) terms.push(this.searchInput.val() + '*');
  var query = terms.join(' AND ');

  if (!query) {
    this.browseAndScroll();
  } else {
    this.searchAndScroll();
  }
};

// Load default emails sorted by date
EnronSearch.prototype.loadDefaultEmails = function() {
  var _this = this;

  // Only load if no search terms
  if (this.searchTerms.length > 0 || this.searchInput.val()) {
    return;
  }

  this.showLoading();

  var data = {
    from: this.currentPage * this.pageSize,
    size: this.pageSize,
    sort: this.sortOrder
  };

  // Add tag filter if active
  if (this.activeTagFilters.length > 0) {
    data.tags = this.activeTagFilters.join(',');
  }
  data.excludeSpam = true;

  $.ajax({
    method: 'get',
    url: '/browse',
    data: data,
    success: function(results) {
      _this.totalResults = results.hits.total;
      _this.displaySearchResults(results);
      _this.updatePagination();
      $('#empty-state').addClass('hidden');
    },
    error: function() {
      _this.hideLoading();
      $('#empty-state').removeClass('hidden');
    }
  });
};

// Load default emails with pagination
EnronSearch.prototype.browseAndScroll = function() {
  var _this = this;

  this.showLoading();

  var data = {
    from: this.currentPage * this.pageSize,
    size: this.pageSize,
    sort: this.sortOrder
  };

  // Add tag filter if active
  if (this.activeTagFilters.length > 0) {
    data.tags = this.activeTagFilters.join(',');
  }
  data.excludeSpam = true;

  $.ajax({
    method: 'get',
    url: '/browse',
    data: data,
    success: function(results) {
      _this.totalResults = results.hits.total;
      _this.displaySearchResults(results);
      _this.updatePagination();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
};

// Setup sort toggle
EnronSearch.prototype.setupSortToggle = function() {
  var _this = this;

  $('#sort-toggle').on('click', function() {
    var btn = $(this);
    var currentSort = btn.data('sort');
    var newSort = currentSort === 'asc' ? 'desc' : 'asc';

    _this.sortOrder = newSort;
    btn.data('sort', newSort);

    // Update UI
    if (newSort === 'asc') {
      $('#sort-icon-asc').show();
      $('#sort-icon-desc').hide();
      $('#sort-label').text('Oldest first');
    } else {
      $('#sort-icon-asc').hide();
      $('#sort-icon-desc').show();
      $('#sort-label').text('Newest first');
    }

    // Reset to first page and reload
    _this.currentPage = 0;
    _this.paginateResults();
  });
};

// Setup navigation between Search, Saved, and Spam
EnronSearch.prototype.setupNavigation = function() {
  var _this = this;

  $('#nav-search').on('click', function() {
    $('.nav-item').removeClass('active');
    $(this).addClass('active');
    _this.currentView = 'search';
    _this.currentPage = 0;
    $('#email-detail-panel').addClass('hidden');
    // Show search UI elements
    $('.search-header').show();
    $('.results-header .sort-controls').show();
    _this.loadDefaultEmails();
    return false;
  });

  $('#nav-spam').on('click', function() {
    $('.nav-item').removeClass('active');
    $(this).addClass('active');
    _this.currentView = 'spam';
    _this.currentPage = 0;
    $('#email-detail-panel').addClass('hidden');
    // Hide search UI elements for spam view
    $('.search-header').hide();
    $('.results-header .sort-controls').hide();
    _this.displaySpamInList();
    return false;
  });
};

// Setup email detail panel handlers
EnronSearch.prototype.setupModal = function() {
  var _this = this;

  // Close panel
  $(document).on('click', '#close-email-panel', function() {
    $('#email-detail-panel').addClass('hidden').removeClass('fullscreen');
    _this.currentEmail = null;
    return false;
  });

  // Fullscreen toggle
  $(document).on('click', '#fullscreen-email', function() {
    var panel = $('#email-detail-panel');
    var btn = $(this);

    if (panel.hasClass('fullscreen')) {
      panel.removeClass('fullscreen');
      btn.html('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>');
      btn.attr('title', 'Fullscreen');
    } else {
      panel.addClass('fullscreen');
      btn.html('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 4 20 10 20"></polyline><polyline points="20 10 20 4 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>');
      btn.attr('title', 'Exit Fullscreen');
    }
    return false;
  });

  // Expand/collapse email details
  $(document).on('click', '#expand-details', function() {
    var btn = $(this);
    var details = $('#email-details-expanded');

    if (details.hasClass('hidden')) {
      details.removeClass('hidden');
      btn.addClass('expanded');
    } else {
      details.addClass('hidden');
      btn.removeClass('expanded');
    }
    return false;
  });

  // Escape key to close
  $(document).on('keydown', function(e) {
    if (e.keyCode === 27) {
      $('#email-detail-panel').addClass('hidden').removeClass('fullscreen');
      _this.currentEmail = null;
    }
  });

  // View toggle (HTML / Plain Text)
  $(document).on('click', '#view-html', function() {
    _this.viewMode = 'html';
    $('.view-btn').removeClass('active');
    $(this).addClass('active');
    _this.renderEmailBody();
  });

  $(document).on('click', '#view-text', function() {
    _this.viewMode = 'text';
    $('.view-btn').removeClass('active');
    $(this).addClass('active');
    _this.renderEmailBody();
  });

};

// Render email body based on view mode
EnronSearch.prototype.renderEmailBody = function() {
  if (!this.currentEmail) return;

  var body = this.currentEmail.body || '';
  var emailBody = $('#panel-body');

  if (this.viewMode === 'html') {
    // Render as HTML
    emailBody.removeClass('text-view').addClass('html-view');
    // Basic sanitization - remove script tags but allow other HTML
    var sanitized = body
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/on\w+='[^']*'/gi, '');
    emailBody.html(sanitized);
  } else {
    // Render as plain text
    emailBody.removeClass('html-view').addClass('text-view');
    emailBody.text(body);
  }
};

// Format full date for display
EnronSearch.prototype.formatFullDate = function(dateStr) {
  if (!dateStr) return '';
  try {
    var date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch (e) {
    return dateStr;
  }
};

// Open email in side panel
EnronSearch.prototype.openEmailModal = function(email) {
  this.currentEmail = email;

  var panel = $('#email-detail-panel');
  var senderName = this.formatSender(email.from);
  var initials = this.getInitials(email.from);

  // Subject
  $('#panel-subject').text(email.subject || '(no subject)');

  // Sender header - Gmail style
  $('#panel-avatar').text(initials);
  $('#panel-sender-name').text(senderName);
  $('#panel-from').text('<' + (email.from || 'unknown') + '>');

  // Recipient line (shortened)
  var toShort = this.formatSender(email.to);
  $('#panel-to').text(toShort);

  // Full details (expandable)
  $('#panel-from-full').text(email.from || 'Unknown');
  $('#panel-to-full').text(email.to || 'Unknown');

  // CC field
  if (email.cc) {
    $('#panel-cc').text(email.cc);
    $('#panel-cc-row').show();
  } else {
    $('#panel-cc-row').hide();
  }

  // Date field - short version in header, full in expanded
  if (email.date) {
    $('#panel-date').text(this.formatFullDate(email.date));
    $('#panel-date-full').text(email.date);
  } else {
    $('#panel-date').text('');
    $('#panel-date-full').text('Unknown');
  }

  // Reset expanded details state
  $('#email-details-expanded').addClass('hidden');
  $('#expand-details').removeClass('expanded');

  // Render body based on current view mode
  this.renderEmailBody();

  // Update view toggle state
  if (this.viewMode === 'html') {
    $('#view-html').addClass('active');
    $('#view-text').removeClass('active');
  } else {
    $('#view-text').addClass('active');
    $('#view-html').removeClass('active');
  }

  // Update spam button state
  var spamBtn = $('#panel-spam');
  if (email.spam) {
    spamBtn.addClass('is-spam');
    spamBtn.attr('title', 'Remove from spam');
  } else {
    spamBtn.removeClass('is-spam');
    spamBtn.attr('title', 'Mark as spam');
  }

  // Update tags bar
  this.updateEmailTagsBar(email.tags || []);

  panel.removeClass('hidden');
};

// Search and scroll to top (used by pagination)
EnronSearch.prototype.searchAndScroll = function() {
  var _this = this;
  this.nonce = this.nonce + 1;
  var nonce = this.nonce;

  var terms = [].concat(this.searchTerms);
  if (this.searchInput.val()) terms.push(this.searchInput.val() + '*');
  var query = terms.join(' AND ');

  if (!query) return;

  // Show loading
  this.showLoading();

  var data = {
    q: query,
    from: this.currentPage * this.pageSize,
    size: this.pageSize,
    sort: this.sortOrder
  };

  // Add tag filter if active
  if (this.activeTagFilters.length > 0) {
    data.tags = this.activeTagFilters.join(',');
  }
  data.excludeSpam = true;

  $.ajax({
    method: 'get',
    url: '/search',
    data: data,
    success: function(results) {
      if (nonce == _this.nonce) {
        _this.totalResults = results.hits.total;
        _this.displaySearchResults(results);
        _this.updatePagination();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  });
};

// Wire up the type-ahead search
EnronSearch.prototype.typeAheadSearch = function() {
  var _this = this;

  $(document).on('click', '.autocomplete-suggestion', function() {
    _this.completeTag(true);
    return false;
  });

  this.searchInput.keydown(function(e) {
    if (e.keyCode === 9 && _this.searchInput.val().length) {
      _this.completeTag(true);
      return false;
    } else if (e.keyCode === 13) {
      _this.completeTag(false);
      return false;
    }

    _this.currentPage = 0;
    _this.search();
  });
};

EnronSearch.prototype.completeTag = function(useSuggestion) {
  if (this.highlights.hasClass('hidden') || !useSuggestion) {
    this.searchTerms.push(this.searchInput.val());
  } else {
    this.searchTerms.push(this.highlights.text());
  }

  this.highlights.addClass('hidden');
  this.searchInput.val('');

  this.showTerms();
  this.currentPage = 0;
  this.search();
};

// Display term elements below search box
EnronSearch.prototype.showTerms = function() {
  this.terms.html(_(this.searchTerms).map(function(v) {
    return '<span class="tag"><span class="value">' + v + '</span><a class="delete-tag" href="#">×</a></span>';
  }).join(''));
};

// Show loading state
EnronSearch.prototype.showLoading = function() {
  $('#empty-state').addClass('hidden');
  $('#loading-state').removeClass('hidden');
  this.searchResults.empty();
};

// Hide loading state
EnronSearch.prototype.hideLoading = function() {
  $('#loading-state').addClass('hidden');
};

// Hit Java Controller for Search results (throttled)
EnronSearch.prototype.search = function() {
  this.nonce = this.nonce + 1;
  this.safeSearch(this.nonce);
};

EnronSearch.prototype.safeSearch = function(nonce) {
  var _this = this;

  setTimeout(function() {
    if (nonce !== _this.nonce) return;

    var terms = [].concat(_this.searchTerms);
    if (_this.searchInput.val()) terms.push(_this.searchInput.val() + '*');
    var query = terms.join(' AND ');

    // If no query, load default emails sorted by date
    if (!query) {
      _this.highlights.html('');
      _this.loadDefaultEmails();
      return;
    }

    // Show loading
    _this.showLoading();

    var data = {
      q: query,
      from: _this.currentPage * _this.pageSize,
      size: _this.pageSize,
      sort: _this.sortOrder
    };

    // Add tag filter if active
    if (_this.activeTagFilters.length > 0) {
      data.tags = _this.activeTagFilters.join(',');
    }
    data.excludeSpam = true;

    $.ajax({
      method: 'get',
      url: '/search',
      data: data,
      success: function(results) {
        if (nonce == _this.nonce) {
          _this.totalResults = results.hits.total;
          _this.displaySearchResults(results);
          _this.displayHighlighted(results);
          _this.updatePagination();
        }
      }
    });

  }, 250);
};

// Update pagination controls
EnronSearch.prototype.updatePagination = function() {
  var totalPages = Math.ceil(this.totalResults / this.pageSize);
  var pagination = $('#pagination');
  var pageInfo = $('#page-info');
  var prevBtn = $('#prev-page');
  var nextBtn = $('#next-page');

  if (this.totalResults <= this.pageSize) {
    pagination.addClass('hidden');
    return;
  }

  pagination.removeClass('hidden');
  pageInfo.text('Page ' + (this.currentPage + 1) + ' of ' + totalPages);

  prevBtn.prop('disabled', this.currentPage === 0);
  nextBtn.prop('disabled', this.currentPage >= totalPages - 1);
};

// Display search results in UI
EnronSearch.prototype.displaySearchResults = function(results) {
  var _this = this;

  this.hideLoading();
  this.searchResults.empty();

  // Update result count
  $('#result-count').text(results.hits.total.toLocaleString());

  if (results.hits.hits.length === 0) {
    $('#empty-state').removeClass('hidden');
    $('#empty-state h2').text('No Results Found');
    $('#empty-state p').text('Try a different search term or clear your filters.');
    return;
  }

  $('#empty-state').addClass('hidden');

  results.hits.hits.forEach(function(hit) {
    var message = hit._source;
    var id = hit._id;
    var initials = _this.getInitials(message.from);
    var sender = _this.formatSender(message.from);
    var dateStr = _this.formatDate(message.date);
    var emailTags = message.tags || [];

    var element = $('\
      <div class="email-row">\
        <div class="email-avatar"></div>\
        <div class="email-sender"></div>\
        <div class="email-content">\
          <div class="email-subject"></div>\
          <span class="email-date"></span>\
        </div>\
        <div class="email-actions">\
          <button class="email-action-btn email-action-spam" title="Mark as spam">\
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>\
            <span>Spam</span>\
          </button>\
        </div>\
      </div>');

    element.attr('data-id', id);
    element.find('.email-avatar').text(initials);
    element.find('.email-sender').text(sender);
    element.find('.email-subject').text(message.subject || '(no subject)').attr('data-sender', sender);
    element.find('.email-date').text(dateStr);

    // Show tags inline with remove buttons
    if (emailTags.length > 0) {
      var colors = ['#c45d35', '#4a8f5d', '#5b7bb3', '#8b5bb3', '#d4a847', '#6b6b6b'];
      var tagsContainer = $('<div class="email-row-tags"></div>');
      emailTags.forEach(function(t) {
        var tagIndex = _this.allTags.indexOf(t);
        var color = colors[(tagIndex >= 0 ? tagIndex : 0) % colors.length];
        var tagEl = $('<span class="email-tag-inline" style="--tag-color:' + color + '"></span>');
        tagEl.append($('<span class="tag-inline-name"></span>').text(t));
        tagEl.append($('<button class="email-row-remove-tag" title="Remove tag">&times;</button>').data('tag', t));
        tagsContainer.append(tagEl);
      });
      element.find('.email-content').append(tagsContainer);
    }

    var emailData = {
      id: id,
      subject: message.subject,
      from: message.from,
      to: message.to,
      cc: message.cc,
      date: message.date,
      body: message.body,
      tags: emailTags,
      spam: message.spam || false
    };

    // Click row to open modal
    element.data('email', emailData);
    element.on('click', function(e) {
      if (!$(e.target).closest('.email-actions, .email-row-remove-tag').length) {
        _this.openEmailModal($(this).data('email'));
      }
    });

    _this.searchResults.append(element);
  });
};

// Suggest emails based on partial matches
EnronSearch.prototype.displayHighlighted = function(results) {
  var _this = this;

  this.highlights.addClass('hidden');

  if (this.searchInput.val().length && results.hits.hits.length && results.hits.hits[0].highlight) {
    var toHighlight = results.hits.hits[0].highlight.to;
    var highlight = null;
    var from = results.hits.hits[0]._source.from;

    if (toHighlight) {
      var candidates = $('<div>' + toHighlight.shift() + '</div>').find('em');

      _(candidates).each(function(candidate) {
        var candidateText = $(candidate).text();
        if (_this.searchTerms.indexOf(candidateText) === -1) {
          highlight = candidateText;
          return;
        }
      });
    }

    if (!highlight && from.indexOf(this.searchInput.val()) > -1) {
      highlight = from;
    }

    if (highlight) {
      this.highlights.text(highlight);
      this.highlights.removeClass('hidden');
    }
  }
};

// ==========================================================================
// Tags & Spam (API-based backend storage)
// ==========================================================================

// Load spam count from API
EnronSearch.prototype.loadSpamCount = function() {
  var _this = this;
  $.ajax({
    method: 'get',
    url: '/spam-count',
    success: function(response) {
      var count = response.count || 0;
      $('#spam-count').text(count > 0 ? count : '');
    }
  });
};

// Add tag via API
EnronSearch.prototype.addTag = function(emailId, tag, callback) {
  $.ajax({
    type: 'POST',
    url: '/tag',
    data: { emailId: emailId, tag: tag },
    success: function() {
      if (callback) callback();
    }
  });
};

// Remove tag via API
EnronSearch.prototype.removeTag = function(emailId, tag, callback) {
  $.ajax({
    type: 'POST',
    url: '/untag',
    data: { emailId: emailId, tag: tag },
    success: function() {
      if (callback) callback();
    }
  });
};

// Set spam status via API
EnronSearch.prototype.setSpam = function(emailId, isSpam, callback) {
  var _this = this;
  $.ajax({
    type: 'POST',
    url: '/spam',
    data: { emailId: emailId, isSpam: isSpam },
    success: function() {
      _this.loadSpamCount();
      if (callback) callback();
    }
  });
};

// Setup tags and spam UI handlers
EnronSearch.prototype.setupTagsAndSpam = function() {
  var _this = this;

  // Unspam from spam list view
  $(document).on('click', '.email-action-unspam', function(e) {
    e.stopPropagation();
    var id = $(this).data('id');
    var row = $(this).closest('.email-row');
    _this.setSpam(id, false, function() {
      row.fadeOut(300, function() { $(this).remove(); });
      _this.loadSpamCount();
    });
    return false;
  });

  // Color picker in tag dropdown
  $(document).on('click', '.tag-color', function(e) {
    e.stopPropagation();
    $('.tag-color').removeClass('active');
    $(this).addClass('active');
    return false;
  });

  // Toggle tag dropdown
  $(document).on('click', '#panel-tag', function(e) {
    e.stopPropagation();
    var dropdown = $('#tag-dropdown');
    if (dropdown.hasClass('hidden')) {
      _this.renderTagDropdown();
      dropdown.removeClass('hidden');
    } else {
      dropdown.addClass('hidden');
    }
    return false;
  });

  // Close dropdown when clicking outside
  $(document).on('click', function(e) {
    if (!$(e.target).closest('.tag-dropdown-wrapper').length) {
      $('#tag-dropdown').addClass('hidden');
    }
  });

  // Add new tag
  $(document).on('click', '#add-tag-btn', function() {
    var input = $('#new-tag-input');
    var tag = input.val().trim().toLowerCase();
    if (tag && _this.currentEmail) {
      _this.addTag(_this.currentEmail.id, tag, function() {
        // Update current email tags
        if (!_this.currentEmail.tags) _this.currentEmail.tags = [];
        if (_this.currentEmail.tags.indexOf(tag) === -1) {
          _this.currentEmail.tags.push(tag);
        }
        input.val('');
        // Reload all tags from backend
        _this.loadAllTags();
        _this.renderTagDropdown();
        _this.updateEmailTagsBar(_this.currentEmail.tags);
      });
    }
    return false;
  });

  // Enter key to add tag
  $(document).on('keydown', '#new-tag-input', function(e) {
    if (e.keyCode === 13) {
      $('#add-tag-btn').click();
      return false;
    }
  });

  // Toggle existing tag
  $(document).on('change', '.existing-tag-item input', function() {
    if (!_this.currentEmail) return;
    var tag = $(this).data('tag');
    if ($(this).is(':checked')) {
      _this.addTag(_this.currentEmail.id, tag, function() {
        if (!_this.currentEmail.tags) _this.currentEmail.tags = [];
        if (_this.currentEmail.tags.indexOf(tag) === -1) {
          _this.currentEmail.tags.push(tag);
        }
        _this.updateEmailTagsBar(_this.currentEmail.tags);
      });
    } else {
      _this.removeTag(_this.currentEmail.id, tag, function() {
        if (_this.currentEmail.tags) {
          _this.currentEmail.tags = _this.currentEmail.tags.filter(function(t) { return t !== tag; });
        }
        _this.updateEmailTagsBar(_this.currentEmail.tags);
      });
    }
  });

  // Remove tag from email tags bar
  $(document).on('click', '.email-tag .remove-tag', function() {
    if (!_this.currentEmail) return;
    var tag = $(this).data('tag');
    _this.removeTag(_this.currentEmail.id, tag, function() {
      if (_this.currentEmail.tags) {
        _this.currentEmail.tags = _this.currentEmail.tags.filter(function(t) { return t !== tag; });
      }
      _this.updateEmailTagsBar(_this.currentEmail.tags);
      _this.renderTagDropdown();
    });
    return false;
  });

  // Mark/unmark as spam from panel
  $(document).on('click', '#panel-spam', function() {
    if (!_this.currentEmail) return;
    var btn = $(this);
    var id = _this.currentEmail.id;
    var isSpam = !_this.currentEmail.spam;

    _this.setSpam(id, isSpam, function() {
      _this.currentEmail.spam = isSpam;
      if (isSpam) {
        btn.addClass('is-spam');
        btn.attr('title', 'Remove from spam');
        // Remove from search list and close panel
        if (_this.currentView === 'search') {
          $('.email-row[data-id="' + id + '"]').fadeOut(300, function() { $(this).remove(); });
          $('#email-detail-panel').addClass('hidden').removeClass('fullscreen');
          _this.currentEmail = null;
        }
      } else {
        btn.removeClass('is-spam');
        btn.attr('title', 'Mark as spam');
        // Remove from spam list and close panel
        if (_this.currentView === 'spam') {
          $('.email-row[data-id="' + id + '"]').fadeOut(300, function() { $(this).remove(); });
          $('#email-detail-panel').addClass('hidden').removeClass('fullscreen');
          _this.currentEmail = null;
        }
      }
    });
    return false;
  });

  // Tag filter dropdown toggle
  $(document).on('click', '#tag-filter-btn', function(e) {
    e.stopPropagation();
    var dropdown = $('#tag-filter-dropdown');
    if (dropdown.hasClass('hidden')) {
      _this.renderTagFilterDropdown();
      dropdown.removeClass('hidden');
    } else {
      dropdown.addClass('hidden');
    }
    return false;
  });

  // Close tag filter dropdown when clicking outside
  $(document).on('click', function(e) {
    if (!$(e.target).closest('.tag-filter-wrapper').length) {
      $('#tag-filter-dropdown').addClass('hidden');
    }
  });

  // Tag filter: clear all
  $(document).on('click', '.tag-filter-all', function() {
    _this.activeTagFilters = [];
    $('#tag-filter-btn').removeClass('active');
    $('#tag-filter-label').text('All');
    $('#tag-filter-dropdown').addClass('hidden');
    _this.currentPage = 0;
    _this.paginateResults();
    return false;
  });

  // Tag filter: toggle individual tags
  $(document).on('change', '.tag-filter-check input', function(e) {
    e.stopPropagation();
    var tag = $(this).data('tag');
    if ($(this).is(':checked')) {
      if (_this.activeTagFilters.indexOf(tag) === -1) {
        _this.activeTagFilters.push(tag);
      }
    } else {
      _this.activeTagFilters = _this.activeTagFilters.filter(function(t) { return t !== tag; });
    }
    // Update button text
    if (_this.activeTagFilters.length === 0) {
      $('#tag-filter-btn').removeClass('active');
      $('#tag-filter-label').text('All');
    } else if (_this.activeTagFilters.length === 1) {
      $('#tag-filter-btn').addClass('active');
      $('#tag-filter-label').text(_this.activeTagFilters[0]);
    } else {
      $('#tag-filter-btn').addClass('active');
      $('#tag-filter-label').text(_this.activeTagFilters.length + ' tags');
    }
    _this.currentPage = 0;
    _this.paginateResults();
  });

  // Mark as spam from email row
  $(document).on('click', '.email-action-spam', function(e) {
    e.stopPropagation();
    var row = $(this).closest('.email-row');
    var emailData = row.data('email');
    if (emailData) {
      _this.setSpam(emailData.id, true, function() {
        row.fadeOut(300, function() { $(this).remove(); });
      });
    }
    return false;
  });

  // Remove tag from email row
  $(document).on('click', '.email-row-remove-tag', function(e) {
    e.stopPropagation();
    var btn = $(this);
    var tag = btn.data('tag');
    var row = btn.closest('.email-row');
    var emailData = row.data('email');
    if (emailData) {
      _this.removeTag(emailData.id, tag, function() {
        emailData.tags = emailData.tags.filter(function(t) { return t !== tag; });
        row.data('email', emailData);
        btn.closest('.email-tag-inline').fadeOut(200, function() { $(this).remove(); });
        if (_this.activeTagFilters.length > 0 && _this.activeTagFilters.indexOf(tag) !== -1) {
          _this.currentPage = 0;
          _this.paginateResults();
        }
      });
    }
    return false;
  });
};

// Render tag dropdown with existing tags
EnronSearch.prototype.renderTagDropdown = function() {
  var _this = this;
  var container = $('#existing-tags');
  container.empty();

  if (this.allTags.length === 0) {
    return;
  }

  var emailTags = this.currentEmail ? (this.currentEmail.tags || []) : [];

  // Generate a color for each tag based on its name (consistent coloring)
  var colors = ['#c45d35', '#4a8f5d', '#5b7bb3', '#8b5bb3', '#d4a847', '#6b6b6b'];

  this.allTags.forEach(function(tag, index) {
    var isChecked = emailTags.indexOf(tag) !== -1;
    var color = colors[index % colors.length];
    var item = $('\
      <div class="existing-tag-item">\
        <span class="tag-color-dot" style="background:' + color + '"></span>\
        <input type="checkbox" id="tag-' + tag + '" data-tag="' + tag + '"' + (isChecked ? ' checked' : '') + '>\
        <label for="tag-' + tag + '"></label>\
      </div>');
    item.find('label').text(tag);
    container.append(item);
  });
};

// Update email tags bar in detail panel
EnronSearch.prototype.updateEmailTagsBar = function(tags) {
  var _this = this;
  var tagsBar = $('#email-tags-bar');
  var container = $('#email-tags');
  container.empty();

  if (!tags || tags.length === 0) {
    tagsBar.addClass('hidden');
    return;
  }

  // Generate colors for tags
  var colors = ['#c45d35', '#4a8f5d', '#5b7bb3', '#8b5bb3', '#d4a847', '#6b6b6b'];

  tags.forEach(function(tag) {
    // Get consistent color based on tag index in allTags
    var tagIndex = _this.allTags.indexOf(tag);
    var color = colors[(tagIndex >= 0 ? tagIndex : 0) % colors.length];

    var tagEl = $('<span class="email-tag"><span class="tag-dot" style="background:' + color + '"></span><span class="tag-name"></span><button class="remove-tag" data-tag="' + tag + '">×</button></span>');
    tagEl.find('.tag-name').text(tag);
    container.append(tagEl);
  });

  tagsBar.removeClass('hidden');
};

// Render tag filter dropdown
EnronSearch.prototype.renderTagFilterDropdown = function() {
  var _this = this;
  var dropdown = $('#tag-filter-dropdown');
  dropdown.empty();

  // Add "All" option
  var allOption = $('<div class="filter-option tag-filter-all' + (this.activeTagFilters.length === 0 ? ' selected' : '') + '">All emails</div>');
  dropdown.append(allOption);

  // Add each tag with checkbox
  var colors = ['#c45d35', '#4a8f5d', '#5b7bb3', '#8b5bb3', '#d4a847', '#6b6b6b'];
  this.allTags.forEach(function(tag, index) {
    var isChecked = _this.activeTagFilters.indexOf(tag) !== -1;
    var color = colors[index % colors.length];
    var option = $('<label class="filter-option tag-filter-check"><input type="checkbox" data-tag="' + tag + '"' + (isChecked ? ' checked' : '') + '><span class="tag-color-dot" style="background:' + color + '"></span><span class="tag-filter-name"></span></label>');
    option.find('.tag-filter-name').text(tag);
    dropdown.append(option);
  });

  if (this.allTags.length === 0) {
    dropdown.append('<div class="filter-option" style="color: var(--text-tertiary); cursor: default;">No tags created yet</div>');
  }
};

// Display spam emails in main email list
EnronSearch.prototype.displaySpamInList = function() {
  var _this = this;

  this.showLoading();

  // Fetch spam emails from API
  $.ajax({
    type: 'GET',
    url: '/spam-emails',
    data: { size: 100 },
    success: function(results) {
      _this.hideLoading();
      _this.searchResults.empty();

      var total = results.hits.total;
      $('#result-count').text(total);
      _this.totalResults = total;

      if (total === 0) {
        $('#empty-state').removeClass('hidden');
        $('#empty-state h2').text('No Spam');
        $('#empty-state p').text('Emails marked as spam will appear here.');
        $('#pagination').addClass('hidden');
        return;
      }

      $('#empty-state').addClass('hidden');

      results.hits.hits.forEach(function(hit) {
        var message = hit._source;
        var id = hit._id;
        var initials = _this.getInitials(message.from);
        var sender = _this.formatSender(message.from);
        var dateStr = _this.formatDate(message.date);

        var element = $('\
          <div class="email-row">\
            <div class="email-avatar"></div>\
            <div class="email-sender"></div>\
            <div class="email-content">\
              <div class="email-subject"></div>\
              <span class="email-date"></span>\
            </div>\
            <div class="email-actions">\
              <button class="email-action-btn email-action-unspam" title="Remove from spam" data-id="">\
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>\
                <span>Not Spam</span>\
              </button>\
            </div>\
          </div>');

        element.attr('data-id', id);
        element.find('.email-avatar').text(initials);
        element.find('.email-sender').text(sender);
        element.find('.email-subject').text(message.subject || '(no subject)');
        element.find('.email-date').text(dateStr);
        element.find('.email-action-unspam').data('id', id);

        // Build email data
        var emailData = {
          id: id,
          subject: message.subject,
          from: message.from,
          to: message.to,
          cc: message.cc,
          date: message.date,
          body: message.body,
          tags: message.tags || [],
          spam: true
        };

        // Click row to open email
        element.data('email', emailData);
        element.on('click', function(e) {
          if (!$(e.target).closest('.email-actions').length) {
            _this.openEmailModal($(this).data('email'));
          }
        });

        _this.searchResults.append(element);
      });

      $('#pagination').addClass('hidden');
    },
    error: function() {
      _this.hideLoading();
      $('#empty-state').removeClass('hidden');
      $('#empty-state h2').text('Error');
      $('#empty-state p').text('Could not load spam emails.');
    }
  });
};
