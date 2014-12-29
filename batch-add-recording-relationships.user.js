// ==UserScript==
// @name        MusicBrainz: Batch-add "performance of" relationships
// @version     2014-12-28
// @author      Michael Wiencek
// @include     *://musicbrainz.org/artist/*/recordings*
// @include     *://*.musicbrainz.org/artist/*/recordings*
// @match       *://musicbrainz.org/artist/*/recordings*
// @match       *://*.musicbrainz.org/artist/*/recordings*
// ==/UserScript==
//**************************************************************************//

var scr = document.createElement("script");
scr.textContent = "(" + batch_recording_rels + ")();";
document.body.appendChild(scr);

function batch_recording_rels() {

    // HTML helpers

    function make_element(el_name, args) {
        var el = $("<"+el_name+"></"+el_name+">");
        el.append.apply(el, args);
        return el;
    }
    function td() {
        return make_element("td", arguments);
    }
    function tr() {
        return make_element("tr", arguments);
    }
    function table() {
        return make_element("table", arguments);
    }
    function label() {
        return make_element("label", arguments);
    }
    function goBtn(func) {
        return $("<button>Go</button>").click(func);
    }

    // Request rate limiting

    var REQUEST_COUNT = 0;
    setInterval(function () {
        if (REQUEST_COUNT > 0) {
            REQUEST_COUNT -= 1;
        }
    }, 1000);

    function RequestManager(rate, count) {
        this.rate = rate;
        this.count = count;
        this.queue = [];
        this.last = 0;
        this.active = false;
        this.stopped = false;
    }

    RequestManager.prototype.next = function () {
        if (this.stopped || !this.queue.length) {
            this.active = false;
            return;
        }
        this.queue.shift()();
        this.last = new Date().getTime();

        REQUEST_COUNT += this.count;
        if (REQUEST_COUNT >= 10) {
            var diff = REQUEST_COUNT - 9;
            var timeout = diff * 1000;

            setTimeout(function (self) { self.next() }, this.rate + timeout, this);
        } else {
            setTimeout(function (self) { self.next() }, this.rate, this);
        }
    };

    RequestManager.prototype.push = function (req) {
        this.queue.push(req);
        if (!(this.active || this.stopped)) {
            this.start_queue();
        }
    };

    RequestManager.prototype.unshift = function (req) {
        this.queue.unshift(req);
        if (!(this.active || this.stopped)) {
            this.start_queue();
        }
    };

    RequestManager.prototype.start_queue = function () {
        if (this.active) {
            return;
        }
        this.active = true;
        this.stopped = false;
        var now = new Date().getTime();
        if (now - this.last >= this.rate) {
            this.next();
        } else {
            var timeout = this.rate - now + this.last;
            setTimeout(function (self) { self.next() }, timeout, this);
        }
    };

    var ws_requests = new RequestManager(1000, 1);
    var edit_requests = new RequestManager(1500, 2);

    // Get recordings on the page

    var TITLE_SELECTOR = "a[href*='" + window.location.host + "/recording/']";
    var $recordings = $('tr:has(' + TITLE_SELECTOR + ')').data('filtered', false);

    if (!$recordings.length) {
        return;
    }

    var MBID_REGEX = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/;

    var RECORDING_TITLES = {};

    var ASCII_PUNCTUATION = [
        [/…/g, "..."],
        [/‘/g, "'"],
        [/’/g, "'"],
        [/‚/g, "'"],
        [/“/g, "\""],
        [/”/g, "\""],
        [/„/g, "\""],
        [/′/g, "'"],
        [/″/g, "\""],
        [/‹/g, "<"],
        [/›/g, ">"],
        [/‐/g, "-"],
        [/‒/g, "-"],
        [/–/g, "-"],
        [/−/g, "-"],
        [/—/g, "-"],
        [/―/g, "--"]
    ];

    function normalizeTitle(title) {
        title = title.toLowerCase().replace(/\s+/g, '');

        for (var i = 0, len = ASCII_PUNCTUATION.length; i < len; i++) {
            title = title.replace(ASCII_PUNCTUATION[i][0], ASCII_PUNCTUATION[i][1]);
        }

        return title;
    }

    $recordings.each(function (index, row) {
        var $title = $(row).find(TITLE_SELECTOR);
        var mbid = $title.attr('href').match(MBID_REGEX)[0];

        RECORDING_TITLES[mbid] = normalizeTitle(
            $title.text().match(/^(.+?)(?:(?: \([^()]+\))+)?$/)[1]
        );
    });

    var $work_type_options = $('<select id="bpr-work-type"></select>');
    var $work_language_options = $('<select id="bpr-work-language"></select>');

    // Add button to manage performance ARs
    var $relate_table = table(
        tr(td(label("New work with this title:").attr('for',"bpr-new-work")),
           td('<input type="text" id="bpr-new-work"/>',
              goBtn(relate_to_new_titled_work))),
        tr(td(label("Existing work (URL/MBID):").attr('for',"bpr-existing-work")),
           td(entity_lookup($('<input type="text" id="bpr-existing-work"/>'), "work"),
              goBtn(relate_to_existing_work))),
        tr(td("New works using recording titles"),
           td(goBtn(relate_to_new_works))),
        tr(td("Their suggested works"),
           td(goBtn(relate_to_suggested_works))),
        tr(td(label("Work type:").attr('for',"bpr-work-type")),
           td($work_type_options)),
        tr(td(label("Lyrics language:").attr('for', "bpr-work-language")),
           td($work_language_options))).hide();

    var $works_table = table(
        $('<tr id="bpr-works-row"></tr>').append(
            td(label("Load another artist’s works (URL/MBID):").attr('for', "bpr-load-artist")),
            td(entity_lookup($('<input type="text" id="bpr-load-artist"/>'), "artist"),
               goBtn(load_artist_works_btn)))
            .hide());

    var $container = table(
        tr(td("<h3>Relate checked recordings to…</h3>"),
           td("<h3>Cached works</h3>",
              $("<span>(These are used to auto-suggest works.)</span>")
              .css("font-size", "0.9em"))),
        tr(td($relate_table),
           td($works_table)))
        .css({"margin": "0.5em", "background": "#F2F2F2", "border": "1px #999 solid"})
        .insertAfter($("div#content h2")[0]);

    $container.find("table").find("td").css("width", "auto");
    $container.children("tbody").children("tr").children("td").css({ padding: "0.5em", "vertical-align": "top" });

    // Get actual work types/languages

    $.get('/dialog?path=%2Fwork%2Fcreate', function (data) {
        var nodes = $.parseHTML(data);

        $work_type_options
            .append($('#id-edit-work\\.type_id', nodes).children())
            .val($.cookie('bpr_work_type') || 0)
            .on('change', function () {
                $.cookie('bpr_work_type', this.value, { path: '/', expires: 1000 });
            });

        $work_language_options
            .append($('#id-edit-work\\.language_id', nodes).children())
            .val($.cookie('bpr_work_language') || 0)
            .on('change', function () {
                $.cookie('bpr_work_language', this.value, { path: '/', expires: 1000 });
            });
    });

    var hide_performed_recs = $.cookie('hide_performed_recs') === 'true' ? true : false;
    var hide_pending_edits = $.cookie('hide_pending_edits') === 'true' ? true : false;

    function make_checkbox(func, default_val, lbl) {
        var chkbox = $('<input type="checkbox"/>')
            .on("change", func)
            .attr("checked", default_val);
        return label(chkbox, lbl)
    }

    var $display_table = table(
        tr(td(label("Filter recordings list: ",
                    $('<input type="text"/>').on("input", filter_recordings))),
           td(make_checkbox(toggle_performed_recordings, hide_performed_recs,
                            "Hide recordings with performance ARs"),
              "&#160;",
              make_checkbox(toggle_pending_edits, hide_pending_edits,
                            "Hide recordings with pending edits"))))
        .css("margin", "0.5em")
        .insertAfter($container);

    var $recordings_load_msg = $("<span>Loading performance relationships…</span>");

    $("<span></span>")
        .append('<img src="/static/images/icons/loading.gif"/> ', $recordings_load_msg)
        .insertBefore($relate_table);

    // Add additional column

    $(".tbl > thead > tr").append("<th>Performance Attributes</th>");

    var $date_element = $('<input />')
        .attr('type', 'text')
        .attr('placeholder', 'yyyy-mm-dd')
        .addClass('date')
        .addClass('bpr-date-input')
        .css({ color : "#ddd", "width": "7em", border: "1px #999 solid" });

    $recordings.append(td(
        $('<span class="bpr-attr partial">part.</span>/' +
          '<span class="bpr-attr live">live</span>/' +
          '<span class="bpr-attr instrumental">inst.</span>/' +
          '<span class="bpr-attr cover">cover</span>')
            .css("cursor", "pointer")
            .data("checked", false),
        '&#160;',
        $date_element).addClass("bpr_attrs"));

    $(document)
        .on('input', 'input.bpr-date-input', function () {
            var $input = $(this);

            function error() {
                $input.css("border-color", "#f00");
                $input.parent().data("date", null);
            }

            $(this).css("border-color", "#999");

            if (this.value) {
                var parsedDate = MB.utility.parseDate(this.value);

                $(this).css("color", "#000");

                if (!parsedDate.year && !parsedDate.month && !parsedDate.day) {
                    error();
                } else if (!MB.utility.validDate(parsedDate.year, parsedDate.month, parsedDate.day)) {
                    error();
                } else {
                    $(this).parent().data("date", parsedDate);
                }
            }
        })
        .on('click', 'span.bpr-attr', function () {
            var $this = $(this);
            var checked = !$this.data('checked');

            $this
                .data('checked', checked)
                .css({
                    background: checked ? 'blue': 'inherit',
                    color: checked ? 'white' : 'black'
                });
        })

    // Style buttons

    function style_buttons($buttons) {
        return $buttons.css({
            "color": "#565656",
            "background-color": "#FFFFFF",
            "border": "1px solid #D0D0D0",
            "border-top": "1px solid #EAEAEA",
            "border-left": "1px solid #EAEAEA"});
    }

    style_buttons($container.find("button"));

    // Don't check hidden rows when the "select all" checkbox is pressed

    function uncheckRows($rows) {
        $rows.find("input[name=add-to-merge]").attr("checked", false);
    }

    $(".tbl > thead input[type=checkbox]")
        .on("change", function () {
            if (this.checked) {
                uncheckRows($recordings.filter(":hidden"));
            }
        });

    var ARTIST_MBID = window.location.href.match(MBID_REGEX)[0];
    var ARTIST_NAME = $("h1 a").text();
    var $artist_works_msg = $("<td></td>");

    // Load performance relationships

    var CURRENT_PAGE = 1;
    var TOTAL_PAGES = 1;
    var page_numbers = $(".pageselector .sel")[0];
    var recordings_not_parsed = $recordings.length;

    if (page_numbers !== undefined) {
        CURRENT_PAGE = parseInt(page_numbers.href.match(/.+\?page=(\d+)/)[1] || "1", 10);
        TOTAL_PAGES = $("a[rel=xhv\\:last]:first").next("em").text().match(/Page \d+ of (\d+)/);
        TOTAL_PAGES = Math.ceil((TOTAL_PAGES ? parseInt(TOTAL_PAGES[1], 10) : 1) / 2);
    }

    var NAME_FILTER = $.trim($("#id-filter\\.name").val());
    var ARTIST_FILTER = $.trim($("#id-filter\\.artist_credit_id").find("option:selected").text());

    if (NAME_FILTER || ARTIST_FILTER) {
        get_filtered_page(0);
    } else {
        queue_recordings_request(
            "/ws/2/recording?artist=" + ARTIST_MBID +
            "&inc=work-rels" +
            "&limit=50" +
            "&offset=" + ((CURRENT_PAGE - 1) * 50) +
            "&fmt=json"
        );
    }

    function request_recordings(url) {
        var attempts = 1;

        $.get(url, function (data) {
            var recs = data.recordings;
            var cache = {};

            function extract_rec(node) {
                var row = cache[node.id];

                if (row === undefined) {
                    for (var j = 0; j < $recordings.length; j++) {
                        var row_ = $recordings[j];
                        var row_id = $(row_).find(TITLE_SELECTOR).attr("href").match(MBID_REGEX)[0];

                        if (node.id === row_id) {
                            row = row_;
                            break;
                        } else {
                            cache[row_id] = row_;
                        }
                    }
                }

                if (row !== undefined) {
                    parse_recording(node, $(row));
                    recordings_not_parsed -= 1;
                }
            }

            if (recs) {
                for (var i = 0; i < recs.length; i++) {
                    extract_rec(recs[i]);
                }
            } else {
                extract_rec(data);
            }

            if (hide_performed_recs) {
                $recordings.filter(".performed").hide();
                restripeRows();
            }
        })
        .done(function () {
            $recordings_load_msg.parent().remove();
            $relate_table.show();
            load_works_init();
        })
        .fail(function () {
            $recordings_load_msg
                .text("Error loading relationships. Retry #" + attempts + "...")
                .css("color", "red");
            attempts += 1;
            ws_requests.unshift(request_recordings);
        });
    }

    function queue_recordings_request(url) {
        ws_requests.push(function () {
            request_recordings(url);
        });
    }

    function get_filtered_page(page) {
        var url = (
            "/ws/2/recording?query=" +
            (NAME_FILTER ? encodeURIComponent(NAME_FILTER) + "%20AND%20" : "") +
            (ARTIST_FILTER ? "creditname:" + encodeURIComponent(ARTIST_FILTER) + "%20AND%20" : "") +
            " arid:" + ARTIST_MBID +
            "&limit=100" +
            "&offset=" + (page * 100) +
            "&fmt=json"
        );

        ws_requests.push(function () {
            $.get(url, function (data) {
                _.each(data.recordings, function (r) {
                    queue_recordings_request("/ws/2/recording/" + r.id + "?inc=work-rels&fmt=json");
                });

                if (recordings_not_parsed > 0 && page < TOTAL_PAGES - 1) {
                    get_filtered_page(page + 1);
                }
            });
        });
    }

    function parse_recording(node, $row) {
        var rels = node.relations;
        var rec_title = $row.children("td").not(":has(input)").first();

        $row.data("performances", []);
        var $attrs = $row.children("td.bpr_attrs"), performed = false;
        $attrs.data("checked", false).css("color", "black");

        _.each(rels, function (rel) {
            if (!rel.type.match(/performance/)) {
                return;
            }

            if (!performed) {
                $row.addClass("performed");
                performed = true;
            }

            var work_mbid = rel.work.id;
            var work_title = rel.work.title;
            var work_comment = rel.work.disambiguation;
            var attrs = [];

            if (rel.begin) {
                $attrs.find("input.date").val(rel.begin).trigger("input");
            }

            _.each(rel.attributes, function (name) {
                name = name.toLowerCase();
                attrs.push(name);

                var $button = $attrs.find("span." + name);
                if (!$button.data("checked")) {
                    $button.click();
                }
            });

            add_work_link($row, work_mbid, work_title, work_comment, attrs);
            $row.data("performances").push(work_mbid);
        });

        var comment = node.disambiguation;
        if (comment) {
            var date = comment.match(/live(?: .+)?, ([0-9]{4}(?:-[0-9]{2}(?:-[0-9]{2})?)?)(?:\: .+)?$/);
            if (date) {
                $attrs.find("input.date").val(date[1]).trigger("input");
            }
        }

        if (!performed) {
            if (node.title.match(/.+\(live.*\)/) || comment.match(/^live.*/)) {
                $attrs.find("span.live").click();
            } else {
                var url = "/ws/2/recording/" + node.id + "?inc=releases+release-groups&fmt=json";

                var request_rec = function () {
                    $.get(url, function (data) {
                        var releases = data.releases;

                        for (var i = 0; i < releases.length; i++) {
                            if (_.contains(releases[i]["release-group"]["secondary-types"], "Live")) {
                                $attrs.find("span.live").click();
                                break;
                            }
                        }
                    }).fail(function () {
                        ws_requests.push(request_rec);
                    });
                }
                ws_requests.push(request_rec);
            }
        }
    }

    // Load works

    var WORKS_LOAD_CACHE = [];
    var LOADED_WORKS = {};
    var LOADED_ARTISTS = {};

    function load_works_init() {
        var artists_string = localStorage.getItem("bpr_artists " + ARTIST_MBID);
        var artists = [];

        if (artists_string) {
            artists = artists_string.split("\n");
        }

        function callback() {
            if (artists.length > 0) {
                var parts = artists.pop();
                var mbid = parts.slice(0, 36);
                var name = parts.slice(36);

                if (mbid && name) {
                    load_artist_works(mbid, name).done(callback);
                }
            }
        }

        load_artist_works(ARTIST_MBID, ARTIST_NAME).done(callback);
    }

    function load_artist_works(mbid, name) {
        var deferred = $.Deferred();

        if (LOADED_ARTISTS[mbid]) {
            return deferred.promise();
        }

        LOADED_ARTISTS[mbid] = true;

        var $table_row = $("<tr></tr>");
        var $button_cell = $("<td></td>").css("display", "none");
        var $msg = $artist_works_msg;

        if (mbid !== ARTIST_MBID) {
            $msg = $("<td></td>");

            $button_cell.append(
                style_buttons($("<button>Remove</button>"))
                    .click(function () {
                        $table_row.remove();
                        remove_artist_works(mbid);
                    }));
        }

        var $reload = style_buttons($("<button>Reload</button>"))
            .click(function () {
                $button_cell.css("display", "none");
                $msg.text("Loading works for " + name + "...");
                load();
            })
            .prependTo($button_cell);

        $msg.text("Loading works for " + name + "...").css("color", "green"),
        $table_row.append($msg, $button_cell);
        $("tr#bpr-works-row").css("display", "none").before($table_row);

        var works_date = localStorage.getItem("bpr_works_date " + mbid);
        var result = [];

        function finished(result) {
            var parsed = load_works_finish(result);
            update_artist_works_msg($msg, result.length, name, works_date);
            $button_cell.css("display", "table-cell");
            $("tr#bpr-works-row").css("display", "table-row");

            deferred.resolve();
            match_works(parsed[0], parsed[1], parsed[2], parsed[3]);
        }

        if (works_date) {
            var works_string = localStorage.getItem("bpr_works " + mbid);
            if (works_string) {
                finished(works_string.split("\n"));
                return deferred.promise();
            }
        }

        load();
        function load() {
            works_date = new Date().toString();
            localStorage.setItem("bpr_works_date " + mbid, works_date);
            result = [];

            var callback = function (loaded, remaining) {
                result.push.apply(result, loaded);
                if (remaining > 0) {
                    $msg.text("Loading " + remaining.toString() + " works for " + name + "...");
                } else {
                    localStorage.setItem("bpr_works " + mbid, result.join("\n"));
                    finished(result);
                }
            };

            var works_url = "/ws/2/work?artist=" + mbid + "&inc=aliases&limit=50&fmt=json";
            ws_requests.unshift(function () {
                request_works(works_url, 0, -1, callback);
            });
        }

        return deferred.promise();
    }

    function load_works_finish(result) {
        var tmp_mbids = [];
        var tmp_titles = [];
        var tmp_comments = [];
        var tmp_norm_titles = [];

        for (var i = 0; i < result.length; i++) {
            var parts = result[i];
            var mbid = parts.slice(0, 36);

            var rest = parts.slice(36).split("\u00a0");
            var title = rest[0];
            var comment = rest[1] || "";
            var norm_title = normalizeTitle(title);

            LOADED_WORKS[mbid] = true;
            tmp_mbids.push(mbid);
            tmp_titles.push(title);
            tmp_comments.push(comment);
            tmp_norm_titles.push(norm_title);
        }
        return [tmp_mbids, tmp_titles, tmp_comments, tmp_norm_titles];
    }

    function request_works(url, offset, count, callback) {
        $.get(url + "&offset=" + offset, function (data, textStatus, jqXHR) {
            if (count < 0) {
                count = data['work-count'];
            }

            var works = data.works;
            var loaded = [];

            _.each(works, function (work) {
                var comment = work.disambiguation;
                loaded.push(work.id + work.title + (comment ? "\u00a0" + comment : ""));
            });

            callback(loaded, count - offset - works.length);

            if (works.length + offset < count) {
                ws_requests.unshift(function () {
                    request_works(url, offset + 50, count, callback);
                });
            }
        }).fail(function () {
            ws_requests.unshift(function () {
                request_works(url, offset, count, callback);
            });
        });
    }

    function match_works(mbids, titles, comments, norm_titles) {
        if (!mbids.length) {
            return;
        }

        var $not_performed = $recordings.filter(":not(.performed)");
        if (!$not_performed.length) {
            return;
        }

        function sim(r, w) {
            return r == w ? 0 : _.str.levenshtein(r, w) / ((r.length + w.length) / 2);
        }

        var matches = {};

        var to_recording = function ($rec, rec_title) {
            if (rec_title in matches) {
                var match = matches[rec_title];
                suggested_work_link($rec, match[0], match[1], match[2]);
                return;
            }

            var $progress = $("<span></span>");
            rowTitleCell($rec).append(
                $('<div class="suggested-work"></div>').append(
                    $("<span>Looking for matching work…</span>"), "&#160;", $progress)
                        .css({"font-size": "0.9em", "padding": "0.3em", "padding-left": "1em", "color": "orange"}));

            var current = 0;
            var context = { minScore: 0.250001, match: null };
            var total = mbids.length;

            var done = function () {
                var match = context.match;
                if (match !== null) {
                    matches[rec_title] = match;
                    suggested_work_link($rec, match[0], match[1], match[2]);
                } else {
                    $progress.parent().remove();
                }
            };

            var iid = setInterval(function () {
                var j = current++;
                var norm_work_title = norm_titles[j];
                var score = sim(rec_title, norm_work_title);

                if (current % 12 === 0) {
                    $progress.text(current.toString() + "/" + total.toString());
                }

                if (score < context.minScore) {
                    context.match = [mbids[j], titles[j], comments[j]];
                    if (score === 0) {
                        clearInterval(iid);
                        done();
                        return;
                    }
                    context.minScore = score;
                }
                if (j === total - 1) {
                    clearInterval(iid);
                    done();
                }
            }, 0);
        };

        for (var i = 0; i < $not_performed.length; i++) {
            var $rec = $not_performed.eq(i);
            var mbid = $rec.find(TITLE_SELECTOR).attr("href").match(MBID_REGEX)[0];

            to_recording($rec, RECORDING_TITLES[mbid]);
        }
    }

    function suggested_work_link($rec, mbid, title, comment) {
        var $title_cell = rowTitleCell($rec);
        $title_cell.children("div.suggested-work").remove();
        $title_cell.append(
            $('<div class="suggested-work"></div>').append(
                $("<span>Suggested work:</span>").css({"color": "green", "font-weight": "bold"}), "&#160;",
                $("<a></a>")
                    .attr("href", "/work/" + mbid)
                    .text(title),
                    (comment ? "&#160;" : null),
                    (comment ? $("<span></span>").text("(" + comment + ")") : null))
                .css({"font-size": "0.9em", "padding": "0.3em", "padding-left": "1em"}));
        $rec.data("suggested_work_mbid", mbid);
        $rec.data("suggested_work_title", title);
    }

    function remove_artist_works(mbid) {
        if (!LOADED_ARTISTS[mbid]) {
            return;
        }
        delete LOADED_ARTISTS[mbid];

        var artists = localStorage.getItem("bpr_artists " + ARTIST_MBID).split("\n");
        var new_artists = [];

        for (var i = 0; i < artists.length; i++) {
            var _mbid = artists[i].slice(0, 36);
            if (_mbid !== mbid)
                new_artists.push(_mbid + artists[i].slice(36));
        }

        var artists_string = new_artists.join("\n");
        localStorage.setItem("bpr_artists " + ARTIST_MBID, artists_string)
    }

    function cache_work(mbid, title, comment) {
        LOADED_WORKS[mbid] = true;
        WORKS_LOAD_CACHE.push(mbid + title + (comment ? "\u00a0" + comment : ""));

        var norm_title = normalizeTitle(title);
        var works_date = localStorage.getItem("bpr_works_date " + ARTIST_MBID);
        var count = $artist_works_msg.data("works_count") + 1;

        update_artist_works_msg($artist_works_msg, count, ARTIST_NAME, works_date);
        match_works([mbid], [title], [comment], [norm_title]);
    }

    function flush_work_cache() {
        if (!WORKS_LOAD_CACHE.length) {
            return;
        }
        var works_string = localStorage.getItem("bpr_works " + ARTIST_MBID);
        if (works_string) {
            works_string += "\n" + WORKS_LOAD_CACHE.join("\n");
        } else {
            works_string = WORKS_LOAD_CACHE.join("\n");
        }
        localStorage.setItem("bpr_works " + ARTIST_MBID, works_string);
        WORKS_LOAD_CACHE = [];
    }

    function load_artist_works_btn() {
        var $input = $("#bpr-load-artist");

        if (!$input.data("selected")) {
            return;
        }

        var mbid = $input.data("mbid");
        var name = $input.data("name");

        load_artist_works(mbid, name).done(function () {
            var artists_string = localStorage.getItem("bpr_artists " + ARTIST_MBID);
            if (artists_string) {
                artists_string += "\n" + mbid + name;
            } else {
                artists_string = mbid + name;
            }
            localStorage.setItem("bpr_artists " + ARTIST_MBID, artists_string);
        });
    }

    function update_artist_works_msg($msg, count, name, works_date) {
        $msg
            .html("")
            .append(
                count + " works loaded for " + name + "<br/>",
                $('<span>(cached ' + works_date + ')</span>').css({"font-size": "0.8em"})
            )
            .data("works_count", count);
    }

    // Edit creation

    function relate_all_to_work(mbid, title, comment) {
        var deferred = $.Deferred();
        var $rows = checked_recordings();
        var total = $rows.length;

        if (!total) {
            deferred.resolve();
            return deferred.promise();
        }

        for (var i = 0; i < total; i++) {
            var $row = $rows.eq(i);

            $row.children("td").not(":has(input)").first()
                .css("color", "LightSlateGray")
                .find("a").css("color", "LightSlateGray");

            var promise = relate_to_work($row, mbid, title, comment, false, false);
            if (i === total - 1) {
                promise.done(function () { deferred.resolve() });
            }
        }

        if (!LOADED_WORKS[mbid]) {
            cache_work(mbid, title, comment);
            flush_work_cache();
        }

        return deferred.promise();
    }

    function relate_to_new_titled_work() {
        var $rows = checked_recordings();
        var total = $rows.length;
        var title = $("#bpr-new-work").val();

        if (!total || !title) {
            return;
        }

        ws_requests.stopped = true;

        var $button = $(this).attr("disabled", true).css("color", "#EAEAEA");

        function callback() {
            ws_requests.stopped = false;
            ws_requests.start_queue();
            $button.attr("disabled", false).css("color", "#565656");
        }

        create_new_work(title, function (data) {
            var work = data.match(/\/work\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
            relate_all_to_work(work[1], title, "").done(callback)
        });
    }

    function relate_to_existing_work() {
        var $input = $("input#bpr-existing-work");
        var $button = $(this);

        function callback() {
            ws_requests.stopped = false;
            ws_requests.start_queue();
            $button.attr("disabled", false).css("color", "#565656");
        }

        if ($input.data("selected")) {
            ws_requests.stopped = true;

            $button.attr("disabled", true).css("color", "#EAEAEA");

            relate_all_to_work(
                    $input.data("mbid"),
                    $input.data("name"),
                    $input.data("comment") || ""
                )
                .done(callback);
        } else {
            $input.css("background", "#ffaaaa");
        }
    }

    function relate_to_new_works() {
        var $rows = checked_recordings();
        var total_rows = $rows.length;

        if (!total_rows) {
            return;
        }

        ws_requests.stopped = true;

        var $button = $(this)
                .attr("disabled", true)
                .css("color", "#EAEAEA");

        $.each($rows, function (i, row) {
            var $row = $(row);
            var $title_cell = rowTitleCell($row);
            var title = $title_cell.find(TITLE_SELECTOR).text();

            $title_cell.css("color", "LightSlateGray").find("a").css("color", "LightSlateGray");

            create_new_work(title, function (data) {
                var work = data.match(/\/work\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
                var promise = relate_to_work($row, work[1], title, "", true, true);

                if (--total_rows === 0) {
                    promise.done(function () {
                        flush_work_cache();
                        ws_requests.stopped = false;
                        ws_requests.start_queue();
                        $button.attr("disabled", false).css("color", "#565656");
                    });
                }
            });
        });
    }

    function create_new_work(title, callback) {
        function post_edit() {
            var data = "edit-work.name=" + title;
            var work_type = $work_type_options.val();
            var work_lang = $work_language_options.val();

            if (work_type) data += "&edit-work.type_id=" + work_type;
            if (work_lang) data += "&edit-work.language_id=" + work_lang;

            $.post("/work/create", data, callback).fail(function () {
                edit_requests.unshift(post_edit);
            });
        }
        edit_requests.push(post_edit);
    }

    function relate_to_suggested_works() {
        var $rows = checked_recordings().filter(function () {
            return $(this).data("suggested_work_mbid");
        });

        var total = $rows.length;
        if (!total) {
            return;
        }

        var $button = $(this).attr("disabled", true).css("color", "#EAEAEA");
        ws_requests.stopped = true;

        function callback() {
            ws_requests.stopped = false;
            ws_requests.start_queue();
            $button.attr("disabled", false).css("color", "#565656");
        };

        $.each($rows, function (i, row) {
            var $row = $(row);
            var mbid = $row.data("suggested_work_mbid");
            var title = $row.data("suggested_work_title");
            var $title_cell = rowTitleCell($row);

            $title_cell.css("color", "LightSlateGray").find("a").css("color", "LightSlateGray");

            var promise = relate_to_work($row, mbid, title, "", false, false);
            if (i === total - 1) {
                promise.done(callback);
            }
        });
    }

    function add_work_link($row, mbid, title, comment, attrs) {
        var $title_cell = rowTitleCell($row);
        $title_cell.children("div.suggested-work").remove();
        $row.removeData("suggested_work_mbid").removeData("suggested_work_title");
        $title_cell
            .removeAttr("style")
            .append($('<div class="work"></div>')
            .text(attrs.join(' ') + " recording of ")
            .css({"font-size": "0.9em", "padding": "0.3em", "padding-left": "1em"})
            .append($("<a></a>").attr("href", "/work/" + mbid).text(title),
                (comment ? "&#160;" : null),
                (comment ? $("<span></span>").text("(" + comment + ")") : null)));
    }

    function relate_to_work($row, work_mbid, work_title, work_comment, check_loaded, priority) {
        var deferred = $.Deferred();
        var performances = $row.data("performances");

        if (performances) {
            if (performances.indexOf(work_mbid) === -1) {
                performances.push(work_mbid);
            } else {
                deferred.resolve();
                return deferred.promise();
            }
        } else {
            $row.data("performances", [work_mbid]);
        }

        var rec_mbid = $row.find(TITLE_SELECTOR).attr("href").match(MBID_REGEX)[0];
        var $title_cell = rowTitleCell($row);
        var title_link = $title_cell.children("a")[0];
        var $attrs = $row.children("td.bpr_attrs");
        var selectedAttrs = [];

        function selected(attr) {
            var checked = $attrs.children("span." + attr).data("checked") ? 1 : 0;
            if (checked) {
                selectedAttrs.push(attr);
            }
            return checked;
        }

        var data = {
            "rel-editor.rels.0.action": "add",
            "rel-editor.rels.0.link_type": "278",
            "rel-editor.rels.0.entity.1.type": "work",
            "rel-editor.rels.0.entity.1.gid": work_mbid,
            "rel-editor.rels.0.entity.0.type": "recording",
            "rel-editor.rels.0.entity.0.gid": rec_mbid
        };

        var attrs = [];
        if (selected("live")) attrs.push("70007db6-a8bc-46d7-a770-80e6a0bb551a");
        if (selected("partial")) attrs.push("d2b63be6-91ec-426a-987a-30b47f8aae2d");
        if (selected("instrumental")) attrs.push("c031ed4f-c9bb-4394-8cf5-e8ce4db512ae");
        if (selected("cover")) attrs.push("1e8536bd-6eda-3822-8e78-1c0f4d3d2113");

        _.each(attrs, function (attr, index) {
            data["rel-editor.rels.0.attributes." + index + ".type.gid"] = attr;
        });

        var date = $attrs.data("date");
        if (date != null) {
            data["rel-editor.rels.0.period.begin_date.year"] = date["year"];
            data["rel-editor.rels.0.period.begin_date.month"] = date["month"] || "";
            data["rel-editor.rels.0.period.begin_date.day"] = date["day"] || "";
            data["rel-editor.rels.0.period.end_date.year"] = date["year"];
            data["rel-editor.rels.0.period.end_date.month"] = date["month"] || "";
            data["rel-editor.rels.0.period.end_date.day"] = date["day"] || "";
        }

        function post_edit() {
            $(title_link).css("color", "green");

            $.post('/relationship-editor', data, function () {
                add_work_link($row, work_mbid, work_title, work_comment, selectedAttrs);

                $(title_link).removeAttr("style");
                $row.addClass("performed");

                if (hide_performed_recs) {
                    uncheckRows($row.hide());
                    restripeRows();
                }

                deferred.resolve();
            }).fail(function () {
                edit_requests.unshift(post_edit);
            });
        }
        if (priority) {
            edit_requests.unshift(post_edit);
        } else {
            edit_requests.push(post_edit);
        }

        if (check_loaded) {
            if (!LOADED_WORKS[work_mbid]) {
                cache_work(work_mbid, work_title, work_comment);
            }
        }

        return deferred.promise();
    }

    function filter_recordings() {
        var string = this.value.toLowerCase();

        for (var i = 0; i < $recordings.length; i++) {
            var $rec = $recordings.eq(i);
            var title = $rec.find(TITLE_SELECTOR).text().toLowerCase();

            if (title.indexOf(string) !== -1) {
                $rec.data("filtered", false);
                if (!hide_performed_recs || !$rec.hasClass("performed")) {
                    $rec.show();
                }
            } else {
                $rec.hide().data("filtered", true);
            }
        }
        restripeRows();
    }

    function toggle_performed_recordings() {
        var $performed = $recordings.filter(".performed");
        hide_performed_recs = this.checked;

        if (hide_performed_recs) {
            uncheckRows($performed.hide());
        } else {
            $performed.filter(function () { return !$(this).data("filtered") }).show();
        }
        restripeRows();
        $.cookie('hide_performed_recs', hide_performed_recs.toString(), { path: '/', expires: 1000 });
    }

    function toggle_pending_edits(event, checked) {
        var $pending = $recordings.filter(function () {
            return $(this).find(TITLE_SELECTOR).parent().parent().is("span.mp");
        });
        hide_pending_edits = checked !== undefined ? checked : this.checked;

        if (hide_pending_edits) {
            uncheckRows($pending.hide());
        } else {
            $pending.filter(function () { return !$(this).data("filtered") }).show();
        }
        restripeRows();
        $.cookie('hide_pending_edits', hide_pending_edits.toString(), { path: '/', expires: 1000 });
    }
    toggle_pending_edits(null, hide_pending_edits);

    function checked_recordings() {
        return $recordings
            .filter(":visible")
            .filter(function () { return $(this).find("input[name=add-to-merge]:checked").length });
    }

    function entity_lookup($input, entity) {
        $input.on("input", function () {
            var match = this.value.match(MBID_REGEX);
            $(this).data("selected", false);
            if (match) {
                var mbid = match[0];
                ws_requests.unshift(function () {
                    $.get("/ws/2/" + entity + "/" + mbid + "?fmt=json", function (data) {
                        var value = data.title || data.name;
                        var comment = data.disambiguation;
                        var data = {"selected": true, "mbid": mbid, "name": value};

                        if (entity === "work" && comment) {
                            data.comment = comment;
                        }

                        $input.val(value).data(data).css("background", "#bbffbb");
                    }).fail(function () {
                        $input.css("background", "#ffaaaa");
                    });
                });
            } else {
                $input.css("background", "#ffaaaa");
            }
        }).data("selected", false);

        return $input;
    }

    function restripeRows() {
        $recordings.filter(":visible").each(function (index, row) {
            var even = (index + 1) % 2 === 0;
            row.className = row.className.replace(even ? 'odd' : 'even', even ? 'even' : 'odd');
        });
    }

    function rowTitleCell($row) {
        return $row.children('td:has(' + TITLE_SELECTOR + ')');
    }
}