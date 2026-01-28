// Hit's Java API and performs searches 
// on Enron dataset.
function EnronSearch(opts) {
  _.extend(this, {
    searchInput: null, // The search input field.
    searchResults: null, // The search results div.
    highlights: null, // The suggestion area.
    terms: null, // The terms currently being search for.
    searchTerms: [], // search terms.
    nonce: 0, // used to prevent multiple searches.
    currentPage: 0, // current page number (0-indexed).
    pageSize: 30, // results per page.
    totalResults: 0, // total number of results.
    bookmarks: [], // saved bookmarks from localStorage.
  }, opts);

  this.loadBookmarks();
  this.typeAheadSearch();
  this.clearSearch();
  this.setupPagination();
  this.setupBookmarks();
}

// Clear current search.
EnronSearch.prototype.clearSearch = function() {
  var _this = this;

  $('.delete-tag').live('click', function() {
    var parent = $(this).parents('span'),
      tag = parent.find('.value').text();

    _this.searchTerms = _(_this.searchTerms).filter(function(v) {
      return v !== tag;
    });

    _this.showTerms();
    _this.currentPage = 0; // Reset to first page when search changes.
    _this.search();

    return false;
  });
}

// Setup pagination controls.
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
}

// Load bookmarks from localStorage.
EnronSearch.prototype.loadBookmarks = function() {
  var stored = localStorage.getItem('enron-bookmarks');
  this.bookmarks = stored ? JSON.parse(stored) : [];
};

// Save bookmarks to localStorage.
EnronSearch.prototype.saveBookmarks = function() {
  localStorage.setItem('enron-bookmarks', JSON.stringify(this.bookmarks));
};

// Check if an email is bookmarked.
EnronSearch.prototype.isBookmarked = function(id) {
  return this.bookmarks.some(function(b) { return b.id === id; });
};

// Add a bookmark.
EnronSearch.prototype.addBookmark = function(email) {
  if (!this.isBookmarked(email.id)) {
    this.bookmarks.push(email);
    this.saveBookmarks();
    this.updateBookmarkCount();
  }
};

// Remove a bookmark.
EnronSearch.prototype.removeBookmark = function(id) {
  this.bookmarks = this.bookmarks.filter(function(b) { return b.id !== id; });
  this.saveBookmarks();
  this.updateBookmarkCount();
};

// Update bookmark count display.
EnronSearch.prototype.updateBookmarkCount = function() {
  var count = this.bookmarks.length;
  $('#bookmark-count').text(count > 0 ? '(' + count + ')' : '');
};

// Setup bookmark event handlers.
EnronSearch.prototype.setupBookmarks = function() {
  var _this = this;

  // Toggle bookmark on click.
  $(document).on('click', '.bookmark-btn', function() {
    var btn = $(this);
    var id = btn.data('id');
    var email = btn.data('email');

    if (_this.isBookmarked(id)) {
      _this.removeBookmark(id);
      btn.removeClass('bookmarked').text('Save');
    } else {
      _this.addBookmark(email);
      btn.addClass('bookmarked').text('Saved');
    }
    return false;
  });

  // Show bookmarks panel.
  $('#show-bookmarks').on('click', function() {
    _this.showBookmarksPanel();
    return false;
  });

  // Close bookmarks panel.
  $(document).on('click', '#close-bookmarks', function() {
    $('#bookmarks-panel').addClass('hidden');
    return false;
  });

  // Remove from bookmarks panel.
  $(document).on('click', '.remove-bookmark', function() {
    var id = $(this).data('id');
    _this.removeBookmark(id);
    $(this).closest('.bookmark-item').remove();
    if (_this.bookmarks.length === 0) {
      $('#bookmarks-list').html('<p class="no-bookmarks">No saved emails yet.</p>');
    }
    // Update button state in search results if visible.
    $('.bookmark-btn[data-id="' + id + '"]').removeClass('bookmarked').text('Save');
    return false;
  });

  this.updateBookmarkCount();
};

// Show the bookmarks panel.
EnronSearch.prototype.showBookmarksPanel = function() {
  var panel = $('#bookmarks-panel');
  var list = $('#bookmarks-list');
  list.empty();

  if (this.bookmarks.length === 0) {
    list.html('<p class="no-bookmarks">No saved emails yet.</p>');
  } else {
    this.bookmarks.forEach(function(email) {
      var item = $('<div class="bookmark-item">\
        <div class="bookmark-header">\
          <b class="subject"></b>\
          <a href="#" class="remove-bookmark" data-id="">Remove</a>\
        </div>\
        <div><b>from: </b><i class="from"></i></div>\
        <div><b>to: </b><i class="to"></i></div>\
        <p class="body"></p>\
      </div>');

      item.find('.subject').text(email.subject || '(no subject)');
      item.find('.from').text(email.from);
      item.find('.to').text(email.to);
      item.find('.body').text(email.body ? email.body.replace(/[\r\n]/, ' ').substring(0, 500) + '...' : '');
      item.find('.remove-bookmark').data('id', email.id);

      list.append(item);
    });
  }

  panel.removeClass('hidden');
};

// Search and scroll to top (used by pagination).
EnronSearch.prototype.searchAndScroll = function() {
  var _this = this;
  this.nonce = this.nonce + 1;
  var nonce = this.nonce;

  // Build query from previously entered searches.
  var terms = [].concat(this.searchTerms);
  if (this.searchInput.val()) terms.push(this.searchInput.val() + '*');
  var query = terms.join(' AND ');

  if (!query) return;

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
}

// Wire up the type-ahead search.
EnronSearch.prototype.typeAheadSearch = function() {
  var _this = this,
    data = null;

  $('.button').live('click', function() {
    _this.completeTag(true);
    return false;
  });

  this.searchInput.keydown(function(e) {
    if ( e.keyCode === 9 && _this.searchInput.val().length) {
      _this.completeTag(true);
      return false;
    } else if (e.keyCode === 13) {
      _this.completeTag(false);
      return false;
    }

    _this.currentPage = 0; // Reset to first page when typing.
    _this.search();
  });
};

EnronSearch.prototype.completeTag = function(useSuggestion) {
  // Keep a canonical list of terms.
  if (this.highlights.hasClass('hidden') || !useSuggestion) {
    this.searchTerms.push(this.searchInput.val());
  } else {
    this.searchTerms.push(this.highlights.text());
  }

  // Reset input box.
  this.highlights.addClass('hidden');
  this.searchInput.val(''); // reset search field.

  this.showTerms();
  this.currentPage = 0; // Reset to first page when search changes.
  this.search();
};

// Displa term elements below search box.
EnronSearch.prototype.showTerms = function() {
  // Display tag elements.
  this.terms.html( _(this.searchTerms).map(function(v) {
    return '<span class="tag"><span class="value">' + v + '</span><a class="delete-tag" href="#">[x]</a></span>';
  }).join(', ') );
};

// Hit our Java Controller for Search results,
// throttled to once every 250ms.
EnronSearch.prototype.search = function() {
  this.nonce = this.nonce + 1;
  this.safeSearch( this.nonce );
};

EnronSearch.prototype.safeSearch = function(nonce) {
  var _this = this;

  // only search once every 250ms.
  setTimeout(function() {

    if (nonce !== _this.nonce) return;

    // Build query from previously entered searches
    // and from current value of search field.
    var terms = [].concat(_this.searchTerms);
    if (_this.searchInput.val()) terms.push( _this.searchInput.val() + '*');
    var query = terms.join(' AND ');

    // Clear search results if query is blank.
    if (!query) {
      _this.displaySearchResults( {hits: {hits: [], total: 0}} );
      _this.highlights.html('');
      _this.updatePagination();
      return;
    }

    data = {
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

// Update pagination controls.
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
  pageInfo.text('Page ' + (this.currentPage + 1) + ' of ' + totalPages + ' (' + this.totalResults + ' results)');

  prevBtn.prop('disabled', this.currentPage === 0);
  nextBtn.prop('disabled', this.currentPage >= totalPages - 1);
};

// Display search results in UI.
EnronSearch.prototype.displaySearchResults = function(results) {
  var _this = this;

  this.searchResults.html('<span class="count">' + results.hits.total + ' search results</span>');

  results.hits.hits.forEach(function(hit) {
    var message = hit._source,
      id = hit._id,
      isBookmarked = _this.isBookmarked(id),
      element = $('<div class="search-results">\
        <div class="result-header">\
          <b class="subject"></b>\
          <a href="#" class="bookmark-btn">Save</a>\
        </div>\
        <div><b>from: </b><i class="from"></i></div>\
        <div><b>to: </b><i class="to"></i></div>\
        <p class="body"></p>\
        <hr />\
      </div>');

    element.find('.subject').text(message.subject || '(no subject)');
    element.find('.to').text(message.to);
    element.find('.from').text(message.from);
    element.find('.body').text(message.body.replace(/[\r\n]/, ' ').substring(0, 1024) + '...');

    // Setup bookmark button.
    var bookmarkBtn = element.find('.bookmark-btn');
    bookmarkBtn.data('id', id);
    bookmarkBtn.data('email', {
      id: id,
      subject: message.subject,
      from: message.from,
      to: message.to,
      body: message.body
    });

    if (isBookmarked) {
      bookmarkBtn.addClass('bookmarked').text('Saved');
    }

    _this.searchResults.append(element);
  });
};

// Suggest emails that we might filter by, based on partial
// matches in to and from field.
EnronSearch.prototype.displayHighlighted = function(results) {

  var _this = this;

  this.highlights.addClass('hidden');

  if (this.searchInput.val().length && results.hits.hits.length && results.hits.hits[0].highlight) {

    var toHighlight = results.hits.hits[0].highlight.to,
      highlight = null,
      from = results.hits.hits[0]._source.from;

    if (toHighlight) {

      // use jQuery to tokenize terms.
      var candidates = $( '<div>' + toHighlight.shift() + '</div>').find('em');

      _(candidates).each(function(candidate) {
        var candidate = $(candidate).text();

        if (_this.searchTerms.indexOf(candidate) === -1) {
          highlight = candidate;
          return;
        }
      });
    }

    // Was it the from field being highlighted?
    if ( !highlight && from.indexOf(this.searchInput.val()) > -1 ) {
      highlight = from;
    }

    // Don't highlight an email we already scope search
    // results to.
    if (highlight) {
      this.highlights.text(highlight);
      this.highlights.removeClass('hidden');
    }
  }
};