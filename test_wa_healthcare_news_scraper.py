#!/usr/bin/env python3
"""
Offline tests for wa_healthcare_news_scraper.py.

Uses embedded RSS/Atom fixtures (Google News RSS and WordPress-style feeds)
so no network access is required:

    python3 test_wa_healthcare_news_scraper.py
"""

import email.utils
import json
import tempfile
import unittest
import unittest.mock
from datetime import datetime, timedelta, timezone
from pathlib import Path

import wa_healthcare_news_scraper as scraper

NOW = datetime.now(timezone.utc)

ARTICLE_PAGE = b"""<!DOCTYPE html><html><head><title>t</title>
<meta property="og:image"
 content="https://cdn.example-news.com/photos/multicare-mob-tacoma.jpg">
<script>var x = "junk that should never appear";</script></head><body>
<nav><p>Home News Sports Subscribe to our newsletter for daily updates</p>
<img src="/assets/site-logo.png" alt="Example News logo" width="200"
 height="50"></nav>
<article>
<h1>MultiCare opens new medical office building in Tacoma</h1>
<figure><img src="/photos/multicare-building-front.jpg"
 alt="The new MultiCare medical office building in Tacoma" width="1200"
 height="800"><figcaption>The new building.</figcaption></figure>
<p>MultiCare Health System opened a new 60,000 square foot medical office
building in Tacoma on Monday, expanding outpatient care capacity across
Pierce County for thousands of patients.</p>
<p>The $150 million project took two years to build and will house primary
care, cardiology and imaging services under one roof for the health system.</p>
<p>Hospital officials said the building will add 120 jobs over the next
year as clinics open in phases through the spring.</p>
</article>
<footer><p>Copyright \xc2\xa9 2026 Example Media. All rights reserved. Privacy
Policy and Terms of Use apply to this site always.</p></footer>
</body></html>"""

CONFLICTING_PAGE = b"""<html><body><article>
<p>MultiCare cut the ribbon on its newest Tacoma medical office building on
Monday morning, a project company executives called a major expansion.</p>
<p>The project cost $120 million according to figures the health system
shared with reporters during the opening event this week.</p>
</article></body></html>"""

GOOGLE_REDIRECT_PAGE = b"""<html><head><title>Opening</title></head><body>
<c-wiz><a href="https://news.google.com/home">Google News</a>
<a href="https://www.example-news.com/multicare-tacoma">Open article</a>
</c-wiz></body></html>"""


def rfc822(dt):
    return email.utils.format_datetime(dt)


def gnews_item(title, source, source_url, published, link):
    return """
    <item>
      <title>{title} - {source}</title>
      <link>{link}</link>
      <guid isPermaLink="false">{link}</guid>
      <pubDate>{pub}</pubDate>
      <description>&lt;a href="{link}"&gt;{title}&lt;/a&gt;&lt;font
        color="#6f6f6f"&gt;{source}&lt;/font&gt;</description>
      <source url="{source_url}">{source}</source>
    </item>""".format(title=title, source=source, source_url=source_url,
                      pub=rfc822(published), link=link)


GNEWS_FIXTURE = ("""<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:media="http://search.yahoo.com/mrss/" version="2.0">
<channel>
<title>"query" - Google News</title>
<link>https://news.google.com/search</link>
""" + gnews_item(
    "MultiCare opens new medical office building in Tacoma",
    "Puget Sound Business Journal", "https://www.bizjournals.com/seattle",
    NOW - timedelta(hours=2), "https://news.google.com/rss/articles/aaa111",
) + gnews_item(
    "EvergreenHealth expands Kirkland hospital campus",
    "Seattle Times", "https://www.seattletimes.com",
    NOW - timedelta(hours=120), "https://news.google.com/rss/articles/old99",
) + gnews_item(
    "Olympia lawmakers head to Washington, D.C. for hospital funding talks",
    "The Hill", "https://thehill.com",
    NOW - timedelta(hours=3), "https://news.google.com/rss/articles/dc0001",
) + gnews_item(
    "Man taken to Harborview after shooting in Seattle",
    "KOMO News", "https://komonews.com",
    NOW - timedelta(hours=1), "https://news.google.com/rss/articles/noise1",
) + gnews_item(
    "Providence lays off 120 workers at Everett hospital",
    "Everett Herald", "https://www.heraldnet.com",
    NOW - timedelta(hours=4), "https://news.google.com/rss/articles/wf0001",
) + gnews_item(
    "Sana Biotechnology raises $150M Series B to expand Seattle manufacturing",
    "GeekWire", "https://www.geekwire.com",
    NOW - timedelta(hours=5), "https://news.google.com/rss/articles/inv001",
) + gnews_item(
    "MultiCare opens new medical office building in Tacoma, Wash.",
    "The News Tribune", "https://www.thenewstribune.com",
    NOW - timedelta(hours=6), "https://news.google.com/rss/articles/dup001",
) + gnews_item(
    "Fred Hutch launches cancer vaccine clinical trial",
    "KUOW", "https://www.kuow.org",
    NOW - timedelta(hours=7), "https://news.google.com/rss/articles/ls0001",
) + """
</channel>
</rss>""").encode("utf-8")


WORDPRESS_FIXTURE = ("""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
<title>STAT</title>
<item>
  <title>Washington hospitals brace for Medicaid cuts</title>
  <link>https://www.statnews.com/2026/08/17/wa-medicaid/</link>
  <pubDate>""" + rfc822(NOW - timedelta(hours=8)) + """</pubDate>
  <description><![CDATA[<p>Hospitals across Washington state face budget
    pressure as Medicaid reimbursement changes hit health systems.</p>]]>
  </description>
</item>
<item>
  <title>Texas hospital chain announces expansion</title>
  <link>https://www.statnews.com/2026/08/17/texas/</link>
  <pubDate>""" + rfc822(NOW - timedelta(hours=9)) + """</pubDate>
  <description><![CDATA[Dallas-based system adds beds.]]></description>
</item>
</channel>
</rss>""").encode("utf-8")


ATOM_FIXTURE = ("""<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom</title>
  <entry>
    <title>Allen Institute opens Seattle research lab expansion</title>
    <link rel="alternate" href="https://example.org/allen-institute"/>
    <updated>""" + (NOW - timedelta(hours=3)).isoformat() + """</updated>
    <summary>The Allen Institute added 40,000 square feet of lab space
      in Seattle.</summary>
  </entry>
</feed>""").encode("utf-8")


def evaluate(title, summary="", published=None, source_name="",
             source_url="", link="https://example.com/a", **kwargs):
    raw = {"title": title, "summary": summary, "link": link,
           "published": published or NOW - timedelta(hours=1),
           "source_name": source_name, "source_url": source_url}
    return scraper.evaluate_item(raw, origin="test", **kwargs)


class TestParsing(unittest.TestCase):
    def test_google_news_rss(self):
        items = scraper.parse_feed(GNEWS_FIXTURE)
        self.assertEqual(len(items), 8)
        first = items[0]
        self.assertIn("MultiCare opens new medical office", first["title"])
        self.assertEqual(first["source_name"], "Puget Sound Business Journal")
        self.assertEqual(first["source_url"],
                         "https://www.bizjournals.com/seattle")
        self.assertIsNotNone(first["published"])
        self.assertLess((NOW - first["published"]).total_seconds(),
                        3 * 3600)

    def test_wordpress_rss_cdata(self):
        items = scraper.parse_feed(WORDPRESS_FIXTURE)
        self.assertEqual(len(items), 2)
        self.assertIn("Medicaid", items[0]["title"])
        self.assertIn("Washington state", items[0]["summary"])

    def test_atom(self):
        items = scraper.parse_feed(ATOM_FIXTURE)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["link"],
                         "https://example.org/allen-institute")
        self.assertIsNotNone(items[0]["published"])

    def test_bom_handling(self):
        items = scraper.parse_feed(b"\xef\xbb\xbf" + ATOM_FIXTURE)
        self.assertEqual(len(items), 1)

    def test_bad_xml_raises(self):
        with self.assertRaises(Exception):
            scraper.parse_feed(b"<html>not a feed</html><oops")

    def test_parse_date(self):
        self.assertIsNotNone(
            scraper.parse_date("Sun, 17 Aug 2026 08:00:00 GMT"))
        self.assertIsNotNone(scraper.parse_date("2026-08-17T08:00:00Z"))
        self.assertIsNone(scraper.parse_date("not a date"))
        self.assertIsNone(scraper.parse_date(""))
        naive = scraper.parse_date("2026-08-17T08:00:00")
        self.assertEqual(naive.tzinfo, timezone.utc)

    def test_strip_html(self):
        self.assertEqual(
            scraper.strip_html("<p>Hello &amp;   <b>world</b></p>"),
            "Hello & world")

    def test_unwrap_bing_redirect(self):
        wrapped = ("https://www.bing.com/news/apiclick.aspx?ref=FexRss"
                   "&url=https%3A%2F%2Fexample.com%2Fstory&cc=us")
        self.assertEqual(scraper.unwrap_redirect(wrapped),
                         "https://example.com/story")
        plain = "https://example.com/story"
        self.assertEqual(scraper.unwrap_redirect(plain), plain)

    def test_clean_google_title(self):
        self.assertEqual(
            scraper.clean_google_title("Headline here - Seattle Times",
                                       "Seattle Times"),
            "Headline here")


class TestScoring(unittest.TestCase):
    def test_wa_hospital_story_kept(self):
        art, reason = evaluate(
            "MultiCare opens new medical office building in Tacoma")
        self.assertIsNone(reason)
        self.assertEqual(art.category, "medical_office")
        self.assertIn("tacoma", art.region_hits)

    def test_layoffs_categorized_workforce(self):
        art, reason = evaluate(
            "Providence lays off 120 workers at Everett hospital")
        self.assertIsNone(reason)
        self.assertEqual(art.category, "workforce")

    def test_biotech_funding_categorized_investment(self):
        art, reason = evaluate(
            "Sana Biotechnology raises $150M Series B to expand "
            "Seattle manufacturing")
        self.assertIsNone(reason)
        self.assertEqual(art.category, "investment")

    def test_life_sciences_category(self):
        art, reason = evaluate(
            "Fred Hutch launches cancer vaccine clinical trial")
        self.assertIsNone(reason)
        self.assertEqual(art.category, "life_sciences")

    def test_hospital_category(self):
        art, reason = evaluate(
            "UW Medicine reports record patient volumes at Seattle "
            "hospitals")
        self.assertIsNone(reason)
        self.assertEqual(art.category, "hospitals")

    def test_non_wa_dropped(self):
        art, reason = evaluate("Texas hospital chain announces expansion",
                               summary="Dallas-based system adds beds.")
        self.assertIsNone(art)
        self.assertIn("not Washington", reason)

    def test_non_healthcare_dropped(self):
        art, reason = evaluate(
            "Seattle City Council debates transportation levy")
        self.assertIsNone(art)
        self.assertIn("not healthcare", reason)

    def test_dc_story_dropped(self):
        art, reason = evaluate(
            "Olympia lawmakers head to Washington, D.C. for hospital "
            "funding talks")
        self.assertIsNone(art)
        self.assertIn("D.C.", reason)

    def test_dc_mention_with_strong_wa_signal_kept(self):
        art, reason = evaluate(
            "Seattle hospital leaders testify in Washington, D.C. on "
            "Medicaid funding")
        self.assertIsNone(reason)
        self.assertIsNotNone(art)

    def test_crime_noise_dropped(self):
        art, reason = evaluate(
            "Man taken to Harborview after shooting in Seattle")
        self.assertIsNone(art)
        self.assertIn("incidental", reason)

    def test_strong_topic_survives_noise_terms(self):
        art, reason = evaluate(
            "MultiCare medical office building construction continues "
            "in Tacoma after crash on site")
        self.assertIsNone(reason)
        self.assertIsNotNone(art)

    def test_wa_source_domain_satisfies_region(self):
        art, reason = evaluate(
            "Local health system announces new hospital wing",
            source_name="Seattle Times",
            source_url="https://www.seattletimes.com")
        self.assertIsNone(reason)
        self.assertTrue(
            any(h.startswith("wa-source:") for h in art.region_hits))

    def test_topic_implied_feed(self):
        art, reason = evaluate(
            "Washington state officials weigh new rules",
            summary="Rulemaking continues in Olympia.",
            topic_implied=True)
        self.assertIsNone(reason)
        self.assertIsNotNone(art)

    def test_region_implied_feed(self):
        art, reason = evaluate(
            "New behavioral health clinic opens downtown",
            region_implied=True)
        self.assertIsNone(reason)
        self.assertIn("regional-feed", art.region_hits)


class TestDedupe(unittest.TestCase):
    def _art(self, title, url, hours_ago=1, score=5):
        return scraper.Article(
            title=title, url=url, source="s",
            published=NOW - timedelta(hours=hours_ago), score=score)

    def test_near_duplicate_titles_collapse(self):
        arts = [
            self._art("MultiCare opens new medical office building in "
                      "Tacoma", "https://a.com/1", score=9),
            self._art("MultiCare opens new medical office building in "
                      "Tacoma, Wash.", "https://b.com/2", score=5),
        ]
        kept = scraper.dedupe(arts)
        self.assertEqual(len(kept), 1)
        self.assertEqual(kept[0].url, "https://a.com/1")  # higher score wins

    def test_same_url_collapses(self):
        arts = [self._art("Title one here", "https://a.com/x"),
                self._art("Completely different title", "https://a.com/x")]
        self.assertEqual(len(scraper.dedupe(arts)), 1)

    def test_distinct_articles_kept(self):
        arts = [self._art("Providence lays off 120 workers in Everett",
                          "https://a.com/1"),
                self._art("Fred Hutch launches cancer vaccine trial",
                          "https://b.com/2")]
        self.assertEqual(len(scraper.dedupe(arts)), 2)


class TestPipeline(unittest.TestCase):
    def _run(self, fetcher, extra_argv=None):
        argv = ["--delay", "0", "--engines", "google"]
        argv += extra_argv or []
        args = scraper.parse_args(argv)
        return scraper.run(args, fetcher=fetcher), args

    def test_end_to_end_with_fixtures(self):
        def fetcher(url, timeout=None, ctx=None):
            if "news.google.com" in url:
                return GNEWS_FIXTURE
            if "statnews.com" in url:
                return WORDPRESS_FIXTURE
            raise OSError("offline")

        (grouped, flat, meta), args = self._run(fetcher)
        titles = [a.title for a in flat]
        # Kept: medical office opener, layoffs, biotech raise, Fred Hutch,
        # and the STAT Medicaid story.
        self.assertEqual(meta["kept"], 5)
        self.assertTrue(any("MultiCare opens" in t for t in titles))
        self.assertTrue(any("lays off" in t for t in titles))
        self.assertTrue(any("Medicaid cuts" in t for t in titles))
        # Dropped: stale item, D.C. item, crime item, Texas item, near-dup.
        self.assertNotIn(
            "EvergreenHealth expands Kirkland hospital campus", titles)
        self.assertNotIn(
            "Man taken to Harborview after shooting in Seattle", titles)
        self.assertFalse(any("Texas" in t for t in titles))
        self.assertEqual(
            sum(1 for t in titles if "MultiCare opens" in t), 1)
        # Categories present and ordered per CATEGORY_ORDER.
        keys = [k for k, _t, _a in grouped]
        self.assertEqual(keys, [k for k, _ in scraper.CATEGORY_ORDER
                                if k in keys])
        # Google title suffix stripped, source preserved.
        mo = next(a for a in flat if "MultiCare opens" in a.title)
        self.assertEqual(mo.source, "Puget Sound Business Journal")
        self.assertNotIn(" - Puget Sound Business Journal", mo.title)
        # Feed failures recorded but do not abort the run.
        self.assertGreater(meta["sources_ok"], 0)
        self.assertLess(meta["sources_ok"], meta["sources_total"])

    def test_all_sources_failed(self):
        def fetcher(url, timeout=None, ctx=None):
            raise OSError("offline")

        (grouped, flat, meta), _args = self._run(fetcher)
        self.assertEqual(meta["sources_ok"], 0)
        self.assertEqual(meta["kept"], 0)
        self.assertEqual(grouped, [])

    def test_reports_written(self):
        def fetcher(url, timeout=None, ctx=None):
            if "news.google.com" in url:
                return GNEWS_FIXTURE
            raise OSError("offline")

        with tempfile.TemporaryDirectory() as tmp:
            (grouped, flat, meta), args = self._run(
                fetcher, ["--out-dir", tmp, "--skip-direct-feeds"])
            written = scraper.write_reports(grouped, flat, meta, args)
            exts = sorted(p.suffix for p in written)
            self.assertEqual(exts, [".html", ".json", ".md"])
            for path in written:
                self.assertTrue(Path(path).exists())
            html_text = next(p for p in written
                             if p.suffix == ".html").read_text("utf-8")
            self.assertIn("MultiCare opens new medical office building",
                          html_text)
            self.assertIn("Washington State Healthcare News Brief", html_text)
            data = json.loads(next(p for p in written
                                   if p.suffix == ".json").read_text("utf-8"))
            self.assertEqual(data["article_count"], len(data["articles"]))
            self.assertTrue(all(a["category"] for a in data["articles"]))
            md_text = next(p for p in written
                           if p.suffix == ".md").read_text("utf-8")
            self.assertIn("## ", md_text)

    def test_hours_window_respected(self):
        def fetcher(url, timeout=None, ctx=None):
            if "news.google.com" in url:
                return GNEWS_FIXTURE
            raise OSError("offline")

        (grouped, flat, meta), _args = self._run(
            fetcher, ["--hours", "168", "--skip-direct-feeds"])
        titles = [a.title for a in flat]
        # The 120-hour-old EvergreenHealth story now falls inside the window.
        self.assertTrue(any("EvergreenHealth" in t for t in titles))


class TestUrlBuilders(unittest.TestCase):
    def test_google_news_url(self):
        url = scraper.google_news_url('hospital "Puget Sound"', 24)
        self.assertIn("news.google.com/rss/search", url)
        self.assertIn("when%3A1d", url)
        url12 = scraper.google_news_url("x", 12)
        self.assertIn("when%3A12h", url12)
        url48 = scraper.google_news_url("x", 48)
        self.assertIn("when%3A2d", url48)

    def test_bing_news_url(self):
        url = scraper.bing_news_url("hospital Seattle")
        self.assertIn("bing.com/news/search", url)
        self.assertIn("format=rss", url)

    def test_build_source_list(self):
        args = scraper.parse_args(["--engines", "google,bing"])
        sources = scraper.build_source_list(args)
        labels = [s[0] for s in sources]
        n_queries = len(scraper.SEARCH_QUERIES)
        self.assertEqual(
            sum(1 for l in labels if l.startswith("google:")), n_queries)
        self.assertEqual(
            sum(1 for l in labels if l.startswith("bing:")), n_queries)
        self.assertEqual(
            sum(1 for l in labels if l.startswith("feed:")),
            len(scraper.DIRECT_FEEDS))

    def test_extra_query(self):
        args = scraper.parse_args(["--extra-query", '"Providence" layoffs'])
        sources = scraper.build_source_list(args)
        self.assertTrue(any("extra-1" in s[0] for s in sources))


class TestArticleExtraction(unittest.TestCase):
    def test_extracts_paragraphs_drops_boilerplate(self):
        text, links = scraper.extract_article_text(
            ARTICLE_PAGE.decode("utf-8"))
        self.assertIn("60,000 square foot", text)
        self.assertIn("$150 million", text)
        self.assertNotIn("junk that should never appear", text)
        self.assertNotIn("newsletter", text)
        self.assertNotIn("All rights reserved", text)

    def test_resolve_google_news_target(self):
        html_text = GOOGLE_REDIRECT_PAGE.decode("utf-8")
        _text, links = scraper.extract_article_text(html_text)
        target = scraper.resolve_google_news_target(html_text, links)
        self.assertEqual(target,
                         "https://www.example-news.com/multicare-tacoma")

    def test_fetch_article_direct(self):
        def fetcher(url, **kwargs):
            return ARTICLE_PAGE

        text, final_url, status, image = scraper.fetch_article_text(
            "https://www.example-news.com/a", fetcher=fetcher)
        self.assertEqual(status, "ok")
        self.assertIn("MultiCare", text)
        self.assertEqual(image["origin"], "publisher")
        self.assertEqual(
            image["url"],
            "https://cdn.example-news.com/photos/multicare-mob-tacoma.jpg")

    def test_fetch_article_google_redirect(self):
        def fetcher(url, **kwargs):
            if "news.google.com" in url:
                return GOOGLE_REDIRECT_PAGE
            return ARTICLE_PAGE

        text, final_url, status, image = scraper.fetch_article_text(
            "https://news.google.com/rss/articles/abc", fetcher=fetcher)
        self.assertEqual(status, "ok")
        self.assertEqual(final_url,
                         "https://www.example-news.com/multicare-tacoma")
        self.assertIn("$150 million", text)
        self.assertIsNotNone(image)

    def test_fetch_article_failure_is_unavailable(self):
        def fetcher(url, **kwargs):
            raise OSError("offline")

        text, final_url, status, image = scraper.fetch_article_text(
            "https://www.example-news.com/a", fetcher=fetcher)
        self.assertEqual(status, "unavailable")
        self.assertEqual(text, "")
        self.assertIsNone(image)


class TestImages(unittest.TestCase):
    TITLE = "MultiCare opens new medical office building in Tacoma"

    def test_publisher_og_image_wins(self):
        page = scraper.extract_page(ARTICLE_PAGE.decode("utf-8"))
        image = scraper.select_article_image(
            page, "https://www.example-news.com/a", self.TITLE)
        self.assertEqual(image["origin"], "publisher")
        self.assertIn("multicare-mob-tacoma.jpg", image["url"])

    def test_logo_in_nav_never_selected(self):
        page = scraper.extract_page(ARTICLE_PAGE.decode("utf-8"))
        urls = [c["url"] for c in page["img_candidates"]]
        self.assertNotIn("/assets/site-logo.png", urls)

    def test_in_article_fallback_scored_by_alt_relevance(self):
        html = """<html><body><article>
        <img src="/img/stock-generic-photo.jpg" width="800" height="600"
         alt="A generic city skyline view">
        <img src="/img/multicare-tacoma-clinic.jpg" width="800" height="600"
         alt="MultiCare medical office building in Tacoma">
        </article></body></html>"""
        page = scraper.extract_page(html)
        image = scraper.select_article_image(
            page, "https://www.example-news.com/a", self.TITLE)
        self.assertEqual(image["origin"], "in-article")
        self.assertIn("multicare-tacoma-clinic.jpg", image["url"])
        # Relative URL was joined against the article URL.
        self.assertTrue(image["url"].startswith(
            "https://www.example-news.com/"))

    def test_excluded_patterns_and_tiny_images(self):
        html = """<html><body><article>
        <img src="/img/site-logo-large.png" width="900" height="700" alt="">
        <img src="/pixels/tracker-1x1.gif" width="1" height="1" alt="">
        <img src="/ads/banner-advert.jpg" width="900" height="700" alt="">
        </article></body></html>"""
        page = scraper.extract_page(html)
        self.assertIsNone(scraper.select_article_image(
            page, "https://x.com/a", self.TITLE))

    def test_lazy_src_and_srcset(self):
        html = """<html><body><article>
        <img data-src="/photos/real-multicare-image.jpg" src="data:image/gif;base64,R0"
         alt="MultiCare building in Tacoma" width="900" height="600">
        <img srcset="/p/small.jpg 300w, /p/medium.jpg 768w, /p/huge.jpg 1600w"
         alt="Tacoma medical office">
        </article></body></html>"""
        page = scraper.extract_page(html)
        urls = [c["url"] for c in page["img_candidates"]]
        self.assertIn("/photos/real-multicare-image.jpg", urls)
        self.assertIn("/p/huge.jpg", urls)

    def test_rss_media_image_parsed_and_used(self):
        rss = ("""<?xml version="1.0"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<item>
  <title>EvergreenHealth opens Kirkland clinic</title>
  <link>https://x.com/a</link>
  <pubDate>""" + rfc822(NOW - timedelta(hours=1)) + """</pubDate>
  <description>A new clinic in Kirkland.</description>
  <media:content url="https://cdn.x.com/clinic-photo.jpg" medium="image"/>
</item>
</channel></rss>""").encode("utf-8")
        items = scraper.parse_feed(rss)
        self.assertEqual(items[0]["image_url"],
                         "https://cdn.x.com/clinic-photo.jpg")
        art, reason = scraper.evaluate_item(items[0], origin="test")
        self.assertIsNone(reason)
        self.assertEqual(art.image["origin"], "feed")
        self.assertEqual(art.image["url"],
                         "https://cdn.x.com/clinic-photo.jpg")

    def test_sniff_image_mime(self):
        self.assertEqual(scraper._sniff_image_mime(b"\xff\xd8\xff\xe0x"),
                         "image/jpeg")
        self.assertEqual(scraper._sniff_image_mime(b"\x89PNG\r\n\x1a\n"),
                         "image/png")
        self.assertEqual(
            scraper._sniff_image_mime(b"RIFF\x00\x00\x00\x00WEBPVP8"),
            "image/webp")
        self.assertIsNone(scraper._sniff_image_mime(b"RIFF____WAVEfmt "))
        self.assertIsNone(scraper._sniff_image_mime(b"<html>"))


class TestSummarization(unittest.TestCase):
    def test_key_points_are_verbatim_sentences(self):
        text, _links = scraper.extract_article_text(
            ARTICLE_PAGE.decode("utf-8"))
        points = scraper.summarize_key_points(
            "MultiCare opens new medical office building in Tacoma", text)
        self.assertTrue(1 <= len(points) <= 3)
        for point in points:
            self.assertIn(point.rstrip("."), text.replace("\n", " "))
        joined = " ".join(points)
        self.assertIn("$150 million", joined)

    def test_no_text_no_points(self):
        self.assertEqual(scraper.summarize_key_points("Title", ""), [])


class TestFacts(unittest.TestCase):
    def test_money_normalization(self):
        self.assertIn(150.0, scraper.extract_facts(
            "raised $150 million for the project")["money"])
        self.assertIn(150.0, scraper.extract_facts("a $150M round")["money"])
        self.assertIn(1200.0, scraper.extract_facts(
            "the $1.2B campus")["money"])
        self.assertIn(0.5, scraper.extract_facts(
            "a $500,000 grant")["money"])

    def test_headcount_sqft_pct(self):
        facts = scraper.extract_facts(
            "lays off 120 workers at the 60,000 square foot clinic, "
            "an 8.5 percent reduction")
        self.assertIn(120, facts["headcount"])
        self.assertIn(60000, facts["sqft"])
        self.assertIn(8.5, facts["pct"])

    def test_percent_not_headcount(self):
        facts = scraper.extract_facts("MultiCare cuts 15% of staff")
        self.assertIn(15.0, facts["pct"])
        self.assertNotIn(15, facts["headcount"])

    def test_compare_conflicting_money(self):
        a = scraper.extract_facts("a $150 million project")
        b = scraper.extract_facts("the $120 million project")
        notes = scraper.compare_facts(a, b, "SourceA", "SourceB")
        self.assertEqual(len(notes), 1)
        self.assertIn("dollar amount differs", notes[0])
        self.assertIn("$150M", notes[0])
        self.assertIn("$120M", notes[0])

    def test_compare_compatible_and_disjoint(self):
        a = scraper.extract_facts("a $1.2 billion project")
        b = scraper.extract_facts("a $1,200 million project")
        self.assertEqual(scraper.compare_facts(a, b, "A", "B"), [])
        c = scraper.extract_facts("adds 300 jobs")
        self.assertEqual(scraper.compare_facts(a, c, "A", "C"), [])


class TestClusteringConsistency(unittest.TestCase):
    def _art(self, title, source, url, summary="", hours_ago=1, score=5):
        art = scraper.Article(
            title=title, url=url, source=source, summary=summary,
            published=NOW - timedelta(hours=hours_ago), score=score)
        art.topic_hits = [h for h in ("multicare",)
                          if h in title.lower() or h in summary.lower()]
        return art

    def test_corroborated_story(self):
        a = self._art("MultiCare opens new medical office building in "
                      "Tacoma", "Source A", "https://a.com/1",
                      "The $150 million project.", score=9)
        b = self._art("MultiCare opens new medical office building in "
                      "Tacoma, Wash.", "Source B", "https://b.com/2",
                      "A $150 million project.")
        clusters = scraper.cluster_articles([a, b])
        self.assertEqual(len(clusters), 1)
        self.assertEqual(len(clusters[0].corroborators), 1)
        verdict = scraper.assess_consistency(clusters[0])
        self.assertEqual(verdict["verdict"], "corroborated")
        self.assertIn("Source A", verdict["details"][0])

    def test_discrepancy_story(self):
        a = self._art("MultiCare opens new medical office building in "
                      "Tacoma", "Source A", "https://a.com/1",
                      "The $150 million project.", score=9)
        b = self._art("New MultiCare medical office building opens in "
                      "Tacoma", "Source B", "https://b.com/2",
                      "The $120 million project.")
        clusters = scraper.cluster_articles([a, b])
        self.assertEqual(len(clusters), 1)
        verdict = scraper.assess_consistency(clusters[0])
        self.assertEqual(verdict["verdict"], "discrepancy")
        self.assertIn("dollar amount differs", verdict["details"][0])

    def test_single_source_story(self):
        a = self._art("Fred Hutch launches cancer vaccine clinical trial",
                      "KUOW", "https://a.com/1")
        clusters = scraper.cluster_articles([a])
        verdict = scraper.assess_consistency(clusters[0])
        self.assertEqual(verdict["verdict"], "single-source")
        self.assertIn("KUOW", verdict["details"][0])

    def test_same_source_duplicate_not_corroborator(self):
        a = self._art("MultiCare opens new medical office building in "
                      "Tacoma", "Source A", "https://a.com/1", score=9)
        b = self._art("MultiCare opens new medical office building in "
                      "Tacoma", "Source A", "https://a.com/2")
        clusters = scraper.cluster_articles([a, b])
        self.assertEqual(len(clusters), 1)
        self.assertEqual(clusters[0].corroborators, [])

    def test_unrelated_stories_stay_apart(self):
        a = self._art("MultiCare opens new medical office building in "
                      "Tacoma", "Source A", "https://a.com/1")
        b = self._art("MultiCare names new chief financial officer",
                      "Source B", "https://b.com/2")
        clusters = scraper.cluster_articles([a, b])
        self.assertEqual(len(clusters), 2)


class TestDigest(unittest.TestCase):
    def _grouped(self):
        a = scraper.Article(
            title="MultiCare opens medical office building in Tacoma",
            url="https://a.com/1", source="Source A",
            summary="The $150 million, 60,000 square foot project.",
            published=NOW - timedelta(hours=1), score=9,
            category="medical_office")
        a.consistency = {"verdict": "corroborated", "details": ["ok"]}
        b = scraper.Article(
            title="Providence lays off 120 workers at Everett hospital",
            url="https://b.com/2", source="Source B",
            published=NOW - timedelta(hours=2), score=7,
            category="workforce")
        b.consistency = {"verdict": "discrepancy",
                         "details": ["headcount differs: A reports 120, "
                                     "B reports 150"]}
        return [("medical_office", "Medical Office", [a]),
                ("workforce", "Workforce", [b])]

    def test_digest_contents(self):
        digest = scraper.build_digest(self._grouped(), 24)
        self.assertIn("two qualifying articles", digest["overview"])
        self.assertIn("One story is corroborated", digest["overview"])
        self.assertIn("past 24 hours", digest["overview"])
        self.assertEqual(len(digest["category_lines"]), 2)
        self.assertIn("Medical Office (1)", digest["category_lines"][0])
        notables = " | ".join(digest["notables"])
        self.assertIn("$150M", notables)
        self.assertIn("60,000 sq. ft.", notables)
        self.assertIn("Verify before use", notables)

    def test_empty_digest(self):
        digest = scraper.build_digest([], 24)
        self.assertIn("No qualifying", digest["overview"])


class TestAIAssist(unittest.TestCase):
    def test_parse_json_reply(self):
        self.assertEqual(scraper.parse_json_reply('[{"id": 0}]'),
                         [{"id": 0}])
        self.assertEqual(
            scraper.parse_json_reply('```json\n{"a": 1}\n```'), {"a": 1})
        self.assertEqual(
            scraper.parse_json_reply('Sure! Here it is: [1, 2]'), [1, 2])
        with self.assertRaises(scraper.AIError):
            scraper.parse_json_reply("no json here")

    def test_claude_complete_and_fallbacks(self):
        captured = {}

        def poster(url, payload, headers, timeout=None, ctx=None):
            captured["payload"] = payload
            captured["headers"] = headers
            return {"stop_reason": "end_turn",
                    "content": [{"type": "text", "text": "hello"}]}

        text = scraper.claude_complete("hi", "claude-opus-5", "key",
                                       poster=poster)
        self.assertEqual(text, "hello")
        self.assertEqual(captured["payload"]["fallbacks"], "default")
        self.assertIn("anthropic-beta", captured["headers"])
        self.assertEqual(captured["payload"]["output_config"]["effort"],
                         "low")

        def haiku_poster(url, payload, headers, timeout=None, ctx=None):
            captured["haiku_payload"] = payload
            return {"stop_reason": "end_turn",
                    "content": [{"type": "text", "text": "ok"}]}

        scraper.claude_complete("hi", "claude-haiku-4-5", "key",
                                poster=haiku_poster)
        self.assertNotIn("fallbacks", captured["haiku_payload"])

    def test_claude_complete_refusal(self):
        def poster(url, payload, headers, timeout=None, ctx=None):
            return {"stop_reason": "refusal", "content": []}

        with self.assertRaises(scraper.AIError):
            scraper.claude_complete("hi", "claude-opus-5", "key",
                                    poster=poster)

    def test_ai_enrich_articles(self):
        art = scraper.Article(
            title="MultiCare opens medical office building",
            url="https://a.com/1", source="Source A",
            published=NOW - timedelta(hours=1), score=9)
        art.article_text = "Some article text about the project."
        art.consistency = {"verdict": "corroborated", "details": ["ok"]}
        cluster = scraper.Cluster(primary=art)

        def poster(url, payload, headers, timeout=None, ctx=None):
            reply = json.dumps([{
                "id": 0,
                "key_points": ["Point one about the building.",
                               "Point two about cost."],
                "consistency_note": "Outlets differ on the opening date.",
            }])
            return {"stop_reason": "end_turn",
                    "content": [{"type": "text", "text": reply}]}

        scraper.ai_enrich_articles([cluster], "claude-opus-5", "key", 10,
                                   poster=poster)
        self.assertEqual(len(art.key_points), 2)
        self.assertEqual(art.summary_method, "ai")
        self.assertEqual(art.consistency["verdict"], "discrepancy")
        self.assertTrue(any("AI cross-check" in d
                            for d in art.consistency["details"]))

    def test_ai_write_digest(self):
        digest = {"method": "template", "overview": "old",
                  "category_lines": ["x"], "notables": ["Verify before y"]}

        def poster(url, payload, headers, timeout=None, ctx=None):
            reply = json.dumps({"overview": "A new overview.",
                                "takeaways": ["Takeaway one."]})
            return {"stop_reason": "end_turn",
                    "content": [{"type": "text", "text": reply}]}

        out = scraper.ai_write_digest(digest, [], 24, "claude-opus-5",
                                      "key", poster=poster)
        self.assertEqual(out["overview"], "A new overview.")
        self.assertEqual(out["method"], "ai")
        self.assertIn("Takeaway one.", out["notables"])
        self.assertIn("Verify before y", out["notables"])

    def test_run_with_ai_but_no_key_falls_back(self):
        def fetcher(url, **kwargs):
            if "news.google.com" in url:
                return GNEWS_FIXTURE
            raise OSError("offline")

        args = scraper.parse_args(
            ["--delay", "0", "--skip-direct-feeds", "--ai",
             "--no-fetch-articles"])
        with unittest.mock.patch.dict("os.environ",
                                      {"ANTHROPIC_API_KEY": ""}):
            grouped, flat, meta = scraper.run(args, fetcher=fetcher)
        self.assertFalse(meta["ai_used"])
        self.assertGreater(meta["kept"], 0)
        self.assertEqual(meta["digest"]["method"], "template")


class TestEnrichedPipeline(unittest.TestCase):
    def _fetcher(self, url, **kwargs):
        if "news.google.com/rss/search" in url:
            return GNEWS_FIXTURE
        if "statnews.com/feed" in url or url.endswith("statnews.com/feed/"):
            return WORDPRESS_FIXTURE
        if "news.google.com/rss/articles" in url:
            return GOOGLE_REDIRECT_PAGE
        if "example-news.com" in url:
            return ARTICLE_PAGE
        if "statnews.com/2026" in url:
            return CONFLICTING_PAGE
        raise OSError("offline")

    def test_end_to_end_enrichment(self):
        args = scraper.parse_args(["--delay", "0", "--engines", "google"])
        grouped, flat, meta = scraper.run(args, fetcher=self._fetcher)
        self.assertEqual(meta["kept"], 5)
        mo = next(a for a in flat if "MultiCare opens" in a.title)
        # The Google redirect resolved to the real article URL.
        self.assertEqual(mo.url,
                         "https://www.example-news.com/multicare-tacoma")
        self.assertEqual(mo.text_status, "ok")
        self.assertTrue(mo.key_points)
        # MultiCare story ran in two outlets -> corroborated.
        self.assertEqual(mo.consistency["verdict"], "corroborated")
        self.assertEqual(len(mo.corroborators), 1)
        self.assertEqual(mo.corroborators[0]["source"], "The News Tribune")
        # Fetch stats and digest are populated.
        self.assertGreater(meta["fetch_stats"]["ok"], 0)
        self.assertIn("qualifying articles", meta["digest"]["overview"])
        counts = meta["consistency_counts"]
        self.assertEqual(counts["corroborated"], 1)
        self.assertEqual(counts["single-source"], 4)
        # The matching page's publisher image was kept ...
        self.assertEqual(mo.image["origin"], "publisher")
        self.assertIn("multicare-mob-tacoma.jpg", mo.image["url"])
        # ... while a mismatched page loses its image with its text.
        prov = next(a for a in flat if "lays off" in a.title)
        self.assertIsNone(prov.image)

    def test_reports_include_new_sections(self):
        args = scraper.parse_args(["--delay", "0", "--engines", "google"])
        with tempfile.TemporaryDirectory() as tmp:
            args = scraper.parse_args(
                ["--delay", "0", "--engines", "google", "--out-dir", tmp])
            grouped, flat, meta = scraper.run(args, fetcher=self._fetcher)
            written = scraper.write_reports(grouped, flat, meta, args)
            html_text = next(p for p in written
                             if p.suffix == ".html").read_text("utf-8")
            self.assertIn("Daily Digest", html_text)
            self.assertIn("Corroborated", html_text)
            self.assertIn("Single source", html_text)
            self.assertIn("Also reported by", html_text)
            self.assertIn("class='points'", html_text)
            self.assertIn("class='thumb'", html_text)
            self.assertIn("multicare-mob-tacoma.jpg", html_text)
            md_text = next(p for p in written
                           if p.suffix == ".md").read_text("utf-8")
            self.assertIn("## Daily Digest", md_text)
            self.assertIn("Consistency: **", md_text)
            self.assertIn("![", md_text)
            # CBRE editorial style: AP times and spelled-out small numbers.
            self.assertRegex(md_text, r"\d{1,2}(:\d{2})? [ap]\.m\. PT")
            self.assertIn("Five articles kept", md_text)
            # Brand masthead with the embedded wordmark and design tokens.
            self.assertIn("class='wordmark'", html_text)
            self.assertIn("data:image/png;base64,", html_text)
            self.assertIn("#003F2D", html_text)
            self.assertIn("Financier Display", html_text)
            self.assertIn("class='kpi'", html_text)
            data = json.loads(next(p for p in written
                                   if p.suffix == ".json").read_text("utf-8"))
            self.assertIn("digest", data)
            self.assertIn("consistency_counts", data)
            self.assertTrue(all("key_points" in a for a in data["articles"]))
            self.assertTrue(all("image" in a for a in data["articles"]))

    def test_embed_and_no_images(self):
        png = b"\x89PNG\r\n\x1a\n" + b"0" * 120

        def fetcher(url, **kwargs):
            if "news.google.com/rss/search" in url:
                return GNEWS_FIXTURE
            if "news.google.com/rss/articles" in url:
                return GOOGLE_REDIRECT_PAGE
            if "cdn.example-news.com" in url:
                return png
            if "example-news.com" in url:
                return ARTICLE_PAGE
            raise OSError("offline")

        args = scraper.parse_args(
            ["--delay", "0", "--engines", "google", "--skip-direct-feeds",
             "--embed-images"])
        grouped, flat, meta = scraper.run(args, fetcher=fetcher)
        mo = next(a for a in flat if "MultiCare opens" in a.title)
        self.assertTrue(mo.image["data_uri"].startswith(
            "data:image/png;base64,"))
        html_text = scraper.render_html(grouped, meta)
        self.assertIn("data:image/png;base64,", html_text)
        # JSON exports the URL but never the bulky data URI.
        data = json.loads(scraper.render_json(flat, meta))
        mo_json = next(a for a in data["articles"]
                       if "MultiCare opens" in a["title"])
        self.assertNotIn("data_uri", mo_json["image"])

        args = scraper.parse_args(
            ["--delay", "0", "--engines", "google", "--skip-direct-feeds",
             "--no-images"])
        grouped, flat, meta = scraper.run(args, fetcher=fetcher)
        self.assertTrue(all(a.image is None for a in flat))
        self.assertNotIn("class='thumb'",
                         scraper.render_html(grouped, meta))

    def test_discrepancy_flagged_end_to_end(self):
        # Two outlets, same story, $150M vs $120M -> discrepancy chip.
        def fetcher(url, **kwargs):
            if "news.google.com/rss/search" in url:
                items = (
                    "<item><title>MultiCare opens new medical office "
                    "building in Tacoma - Source A</title>"
                    "<link>https://www.example-news.com/multicare-tacoma"
                    "</link><pubDate>"
                    + email.utils.format_datetime(NOW - timedelta(hours=1))
                    + "</pubDate><description>The $150 million project."
                    "</description><source url=\"https://sourcea.com\">"
                    "Source A</source></item>"
                    "<item><title>New MultiCare medical office building "
                    "opens in Tacoma - Source B</title>"
                    "<link>https://www.statnews.com/2026/other</link>"
                    "<pubDate>"
                    + email.utils.format_datetime(NOW - timedelta(hours=2))
                    + "</pubDate><description>The $120 million project."
                    "</description><source url=\"https://sourceb.com\">"
                    "Source B</source></item>")
                return ("<?xml version=\"1.0\"?><rss version=\"2.0\">"
                        "<channel>" + items + "</channel></rss>"
                        ).encode("utf-8")
            if "example-news.com" in url:
                return ARTICLE_PAGE
            if "statnews.com" in url:
                return CONFLICTING_PAGE
            raise OSError("offline")

        args = scraper.parse_args(
            ["--delay", "0", "--engines", "google", "--skip-direct-feeds"])
        grouped, flat, meta = scraper.run(args, fetcher=fetcher)
        self.assertEqual(len(flat), 1)
        art = flat[0]
        self.assertEqual(art.consistency["verdict"], "discrepancy")
        self.assertTrue(any("dollar amount differs" in d
                            for d in art.consistency["details"]))
        self.assertEqual(meta["consistency_counts"]["discrepancy"], 1)
        self.assertTrue(any("Verify before use" in n
                            for n in meta["digest"]["notables"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
