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
    bookmarks: [],
    currentEmail: null
  }, opts);

  this.loadBookmarks();
  this.typeAheadSearch();
  this.clearSearch();
  this.setupPagination();
  this.setupBookmarks();
  this.setupModal();
  this.setupNavigation();
}

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
      _this.searchAndScroll();
    }
  });

  $('#next-page').on('click', function() {
    var maxPage = Math.ceil(_this.totalResults / _this.pageSize) - 1;
    if (_this.currentPage < maxPage) {
      _this.currentPage++;
      _this.searchAndScroll();
    }
  });
};

// Setup navigation between Search and Saved
EnronSearch.prototype.setupNavigation = function() {
  var _this = this;

  $('#nav-search').on('click', function() {
    $('.nav-item').removeClass('active');
    $(this).addClass('active');
    $('#bookmarks-panel').addClass('hidden');
    return false;
  });

  $('#nav-bookmarks').on('click', function() {
    $('.nav-item').removeClass('active');
    $(this).addClass('active');
    _this.showBookmarksPanel();
    return false;
  });
};

// Load bookmarks from localStorage
EnronSearch.prototype.loadBookmarks = function() {
  var stored = localStorage.getItem('enron-bookmarks');
  this.bookmarks = stored ? JSON.parse(stored) : [];
};

// Save bookmarks to localStorage
EnronSearch.prototype.saveBookmarks = function() {
  localStorage.setItem('enron-bookmarks', JSON.stringify(this.bookmarks));
};

// Check if an email is bookmarked
EnronSearch.prototype.isBookmarked = function(id) {
  return this.bookmarks.some(function(b) { return b.id === id; });
};

// Add a bookmark
EnronSearch.prototype.addBookmark = function(email) {
  if (!this.isBookmarked(email.id)) {
    this.bookmarks.push(email);
    this.saveBookmarks();
    this.updateBookmarkCount();
  }
};

// Remove a bookmark
EnronSearch.prototype.removeBookmark = function(id) {
  this.bookmarks = this.bookmarks.filter(function(b) { return b.id !== id; });
  this.saveBookmarks();
  this.updateBookmarkCount();
};

// Update bookmark count display
EnronSearch.prototype.updateBookmarkCount = function() {
  var count = this.bookmarks.length;
  $('#bookmark-count').text(count > 0 ? count : '');
};

// Setup bookmark event handlers
EnronSearch.prototype.setupBookmarks = function() {
  var _this = this;

  // Toggle bookmark on row button click
  $(document).on('click', '.email-bookmark', function(e) {
    e.stopPropagation();
    var btn = $(this);
    var id = btn.data('id');
    var email = btn.data('email');

    if (_this.isBookmarked(id)) {
      _this.removeBookmark(id);
      btn.removeClass('bookmarked');
      btn.find('svg').attr('fill', 'none');
    } else {
      _this.addBookmark(email);
      btn.addClass('bookmarked');
    }
    return false;
  });

  // Close bookmarks panel
  $(document).on('click', '#close-bookmarks', function() {
    $('#bookmarks-panel').addClass('hidden');
    $('#nav-search').addClass('active');
    $('#nav-bookmarks').removeClass('active');
    return false;
  });

  // Remove from bookmarks panel
  $(document).on('click', '.remove-bookmark', function(e) {
    e.stopPropagation();
    var id = $(this).data('id');
    _this.removeBookmark(id);
    $(this).closest('.bookmark-item').remove();
    if (_this.bookmarks.length === 0) {
      $('#bookmarks-list').html('<p class="no-bookmarks">No saved emails yet.</p>');
    }
    // Update button state in search results
    $('.email-bookmark[data-id="' + id + '"]').removeClass('bookmarked').find('svg').attr('fill', 'none');
    return false;
  });

  this.updateBookmarkCount();
};

// Show the bookmarks panel
EnronSearch.prototype.showBookmarksPanel = function() {
  var _this = this;
  var panel = $('#bookmarks-panel');
  var list = $('#bookmarks-list');

  // Close email detail panel if open
  $('#email-detail-panel').addClass('hidden');

  list.empty();

  if (this.bookmarks.length === 0) {
    list.html('<p class="no-bookmarks">No saved emails yet.</p>');
  } else {
    this.bookmarks.forEach(function(email) {
      var item = $('\
        <div class="bookmark-item">\
          <div class="bookmark-header">\
            <span class="subject"></span>\
            <a href="#" class="remove-bookmark" data-id="">Remove</a>\
          </div>\
          <div class="meta"></div>\
          <p class="body"></p>\
        </div>');

      item.find('.subject').text(email.subject || '(no subject)');
      item.find('.meta').text('From: ' + _this.formatSender(email.from) + ' → ' + _this.formatSender(email.to));
      item.find('.body').text(email.body ? email.body.replace(/[\r\n]+/g, ' ').substring(0, 200) + '...' : '');
      item.find('.remove-bookmark').data('id', email.id);

      // Click to open email
      item.data('email', email);
      item.on('click', function() {
        _this.openEmailModal($(this).data('email'));
      });

      list.append(item);
    });
  }

  panel.removeClass('hidden');
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

  // Escape key to close
  $(document).on('keydown', function(e) {
    if (e.keyCode === 27) {
      $('#email-detail-panel').addClass('hidden').removeClass('fullscreen');
      $('#bookmarks-panel').addClass('hidden');
      _this.currentEmail = null;
    }
  });

  // Panel bookmark button
  $(document).on('click', '#panel-bookmark', function() {
    if (!_this.currentEmail) return;

    var btn = $(this);
    var id = _this.currentEmail.id;

    if (_this.isBookmarked(id)) {
      _this.removeBookmark(id);
      btn.removeClass('bookmarked').html('\
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path>\
        </svg>\
        Save Email');
      $('.email-bookmark[data-id="' + id + '"]').removeClass('bookmarked').find('svg').attr('fill', 'none');
    } else {
      _this.addBookmark(_this.currentEmail);
      btn.addClass('bookmarked').html('\
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">\
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path>\
        </svg>\
        Saved');
      $('.email-bookmark[data-id="' + id + '"]').addClass('bookmarked');
    }
    return false;
  });
};

// Open email in side panel
EnronSearch.prototype.openEmailModal = function(email) {
  this.currentEmail = email;

  var panel = $('#email-detail-panel');
  $('#panel-subject').text(email.subject || '(no subject)');
  $('#panel-from').text(email.from || 'Unknown');
  $('#panel-to').text(email.to || 'Unknown');

  // CC field
  if (email.cc) {
    $('#panel-cc').text(email.cc);
    $('#panel-cc-row').show();
  } else {
    $('#panel-cc-row').hide();
  }

  // Date field
  if (email.date) {
    $('#panel-date').text(email.date);
    $('#panel-date-row').show();
  } else {
    $('#panel-date-row').hide();
  }

  $('#panel-body').text(email.body || '');

  // Update bookmark button state
  var bookmarkBtn = $('#panel-bookmark');
  if (this.isBookmarked(email.id)) {
    bookmarkBtn.addClass('bookmarked').html('\
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">\
        <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path>\
      </svg>\
      Saved');
  } else {
    bookmarkBtn.removeClass('bookmarked').html('\
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\
        <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path>\
      </svg>\
      Save Email');
  }

  // Close bookmarks panel if open
  $('#bookmarks-panel').addClass('hidden');

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
    size: this.pageSize
  };

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

    if (!query) {
      _this.displaySearchResults({ hits: { hits: [], total: 0 } });
      _this.highlights.html('');
      _this.updatePagination();
      $('#empty-state').removeClass('hidden');
      return;
    }

    // Show loading
    _this.showLoading();

    var data = {
      q: query,
      from: _this.currentPage * _this.pageSize,
      size: _this.pageSize
    };

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

  if (results.hits.total === 0) {
    $('#empty-state').removeClass('hidden');
    return;
  }

  $('#empty-state').addClass('hidden');

  results.hits.hits.forEach(function(hit) {
    var message = hit._source;
    var id = hit._id;
    var isBookmarked = _this.isBookmarked(id);
    var initials = _this.getInitials(message.from);
    var sender = _this.formatSender(message.from);
    var preview = message.body ? message.body.replace(/[\r\n]+/g, ' ').substring(0, 100) : '';
    var dateStr = _this.formatDate(message.date);

    var element = $('\
      <div class="email-row">\
        <div class="email-avatar"></div>\
        <div class="email-sender"></div>\
        <div class="email-content">\
          <div class="email-subject"></div>\
          <div class="email-preview"></div>\
        </div>\
        <div class="email-meta">\
          <span class="email-date"></span>\
          <button class="email-bookmark" title="Save email">\
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\
              <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path>\
            </svg>\
          </button>\
        </div>\
      </div>');

    element.find('.email-avatar').text(initials);
    element.find('.email-sender').text(sender);
    element.find('.email-subject').text(message.subject || '(no subject)').attr('data-sender', sender);
    element.find('.email-preview').text(preview);
    element.find('.email-date').text(dateStr);

    // Setup bookmark button
    var bookmarkBtn = element.find('.email-bookmark');
    var emailData = {
      id: id,
      subject: message.subject,
      from: message.from,
      to: message.to,
      cc: message.cc,
      date: message.date,
      body: message.body
    };
    bookmarkBtn.data('id', id);
    bookmarkBtn.data('email', emailData);

    if (isBookmarked) {
      bookmarkBtn.addClass('bookmarked');
      bookmarkBtn.find('svg').attr('fill', 'currentColor');
    }

    // Click row to open modal
    element.data('email', emailData);
    element.on('click', function(e) {
      if (!$(e.target).closest('.email-bookmark').length) {
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
